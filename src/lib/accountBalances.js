'use strict'

const _ = require('lodash')
const UnprocessableEntityError = require('five-bells-shared/errors/unprocessable-entity-error')
const InsufficientFundsError = require('../errors/insufficient-funds-error')
const log = require('../services/log')('account balances')
const Account = require('../models/db/account').Account
const Bignumber = require('bignumber.js')
const dbcache = require('./dbcache')

function AccountBalances (transaction, transfer) {
  this.transaction = transaction
  this.transfer = transfer
  this._debits = null
  this._credits = null
}

AccountBalances.prototype._setup = function * () {
  this._debits = yield this._getAccountBalances(this.transfer.debits)
  this._credits = yield this._getAccountBalances(this.transfer.credits)
}

AccountBalances.prototype.applyDebits = function * () { yield this._applyDebits(this._debits) }
AccountBalances.prototype.applyCredits = function * () { yield this._applyCredits(this._credits) }
AccountBalances.prototype.revertDebits = function * () { yield this._applyCredits(this._debits) }

function sum (numbers) {
  const numStrings = _.map(numbers, String)
  return _.reduce(_.rest(numStrings), (result, num) => {
    return result.plus(num)
  }, new Bignumber(_.first(numStrings))).toString()
}

function difference (numbers) {
  const numStrings = _.map(numbers, String)
  return _.reduce(_.rest(numStrings), (result, num) => {
    return result.minus(num)
  }, new Bignumber(_.first(numStrings))).toString()
}

AccountBalances.prototype._getAccountBalances = function * (creditsOrDebits) {
  let accounts = _.groupBy(creditsOrDebits, function (creditOrDebit) {
    return creditOrDebit.account
  })

  for (let account of Object.keys(accounts)) {
    const amounts = _.pluck(accounts[account], 'amount')
    let accountObj
    log.debug('Looking up account: ' + account)
    if (dbcache.accounts && dbcache.accounts[account]) {
      log.debug('Cache hit!')
      accountObj = dbcache.accounts[account]
    } else {
      log.debug('Cache miss')
      accountObj = yield Account.findByName(account, { transaction: this.transaction })
      dbcache.accounts[account] = accountObj
    }
    
    if (accountObj === null) {
      throw new UnprocessableEntityError(
        'Account `' + account + '` does not exist.')
    }

    accounts[account] = {
      balance: accountObj.balance,
      totalAmount: sum(amounts),
      minimumAllowedBalance: accountObj.minimum_allowed_balance
    }
  }
  return accounts
}

// Accounts is the object returned by the _getAccountBalances function
AccountBalances.prototype._applyDebits = function * (accounts) {
  const transaction = this.transaction
  const holdAccount = yield this._holdAccount()
  for (let sender of Object.keys(accounts)) {
    const debitAccount = accounts[sender]

    // Check senders' balances
    if (new Bignumber(debitAccount.minimumAllowedBalance).greaterThan(
          difference([debitAccount.balance, debitAccount.totalAmount]))) {
      throw new InsufficientFundsError('Sender has insufficient funds.',
        sender)
    }

    // Take money out of senders' accounts
    let account
    if (dbcache.accounts && dbcache.accounts[sender]) {
      log.debug('Cache hit sender: ' + sender)
      account = dbcache.accounts[sender]
    } else {
      log.debug('Cache miss sender: ' + sender)
      account = yield Account.findByName(sender, { transaction })
      dbcache.accounts[sender] = account
    }
    log.debug('sender ' + sender + ' balance: ' + account.balance +
      ' -> ' + (difference([account.balance, debitAccount.totalAmount])))
    account.balance = difference([account.balance, debitAccount.totalAmount])
    holdAccount.balance = sum([holdAccount.balance, debitAccount.totalAmount])
    yield this._saveAccount(account)
  }
  yield this._saveAccount(holdAccount)
}

// Accounts is the object returned by the _getAccountBalances function
AccountBalances.prototype._applyCredits = function * (accounts) {
  const transaction = this.transaction
  const holdAccount = yield this._holdAccount()
  for (let recipient of Object.keys(accounts)) {
    const creditAccount = accounts[recipient]

    let account
    if (dbcache.accounts[recipient]) {
      log.debug('Cache hit recipient: ' + recipient)
      account = dbcache.accounts[recipient]
    } else {
      log.debug('Cache miss recipient: ' + recipient)
      account = yield Account.findByName(recipient, { transaction })
      dbcache.accounts[recipient] = account
    }
    log.debug('recipient ' + recipient + ' balance: ' + account.balance +
      ' -> ' + sum([account.balance, creditAccount.totalAmount]))
    account.balance = sum([account.balance, creditAccount.totalAmount])
    holdAccount.balance = difference([holdAccount.balance, creditAccount.totalAmount])
    yield this._saveAccount(account)
  }
  yield this._saveAccount(holdAccount)
}

AccountBalances.prototype._saveAccount = function * (account) {
  yield account.createEntry({
    transfer_id: this.transfer.id
  }, {transaction: this.transaction})
  yield account.save({transaction: this.transaction})
}

AccountBalances.prototype._holdAccount = function * () {
  let holdAccount
    if (dbcache.accounts['hold']) {
      log.debug('Cache hit hold')
      holdAccount = dbcache.accounts['hold']
    } else {
      log.debug('Cache miss hold')
      holdAccount = yield Account.findByName('hold', { transaction: this.transaction })
      dbcache.accounts['hold'] = holdAccount
    }
  //const holdAccount = yield Account.findByName('hold', {transaction: this.transaction})
  if (!holdAccount) {
    throw new Error('Missing "hold" account')
  }
  return holdAccount
}

module.exports = function * (transaction, transfer) {
  const accountBalances = new AccountBalances(transaction, transfer)
  yield accountBalances._setup()
  return accountBalances
}
