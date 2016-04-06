'use strict'

const _ = require('lodash')
const Account = require('../models/db/account').Account
const UnprocessableEntityError =
      require('five-bells-shared/errors/unprocessable-entity-error')
const log = require('../services/log')('disabled accounts')
const dbcache = require('./dbcache')

function * validateNoDisabledAccounts (transaction, transfer) {
  const accounts = _.uniq(_.map(transfer.debits.concat(transfer.credits), (creditOrDebit) => {
    return creditOrDebit.account
  }))

  for (const account of accounts) {
    log.debug('Read account: ' + account)
    const accountObj = dbcache.accounts[account]
    // yield Account.findByName(account, { transaction: transaction })
    // TODO: maybe read accounts if cache miss
    if (accountObj === null) {
      throw new UnprocessableEntityError('Account `' + account + '` does not exist.')
    }
    if (accountObj.is_disabled) {
      throw new UnprocessableEntityError('Account `' + account + '` is disabled.')
    }
    // Cache account object
    //log.debug('disabledAccounts read account into dbcache: ' + JSON.stringify(accountObj))
    //dbcache.accounts[account] = accountObj
  }
}

module.exports = validateNoDisabledAccounts
