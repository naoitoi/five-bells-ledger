/*global describe, it*/
'use strict'
const fs = require('fs')
const _ = require('lodash')
const expect = require('chai').expect
const sinon = require('sinon')
const app = require('../src/services/app')
const Account = require('../src/models/db/account').Account
const logger = require('../src/services/log')
const dbHelper = require('./helpers/db')
const appHelper = require('./helpers/app')
const logHelper = require('five-bells-shared/testHelpers/log')

const validator = require('./helpers/validator')

const publicKey = fs.readFileSync('./test/data/public.pem', 'utf8')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Accounts', function () {
  logHelper(logger)

  before(function * () {
    yield dbHelper.init()
  })

  beforeEach(function * () {
    appHelper.create(this, app)
    yield dbHelper.clean()

    this.clock = sinon.useFakeTimers(START_DATE, 'Date')

    // Define example data
    this.exampleAccounts = _.cloneDeep(require('./data/accounts'))
    this.adminAccount = this.exampleAccounts.admin
    this.holdAccount = this.exampleAccounts.hold
    this.existingAccount = this.exampleAccounts.alice
    this.existingAccount2 = this.exampleAccounts.candice
    this.traderAccount = this.exampleAccounts.trader
    this.disabledAccount = this.exampleAccounts.disabledAccount
    this.infiniteMinBalance = this.exampleAccounts.infiniteMinBalance
    this.finiteMinBalance = this.exampleAccounts.finiteMinBalance
    this.unspecifiedMinBalance = this.exampleAccounts.unspecifiedMinBalance

    // Store some example data
    yield dbHelper.addAccounts([
      this.adminAccount,
      this.holdAccount,
      this.existingAccount,
      this.existingAccount2,
      this.traderAccount,
      this.disabledAccount
    ])
  })

  describe('GET /accounts', function () {
    it('should return 200', function * () {
      const account1 = this.adminAccount
      const account2 = this.holdAccount
      const account3 = this.existingAccount
      const account4 = this.existingAccount2
      const account5 = this.traderAccount
      const account6 = this.disabledAccount
      // Passwords are not returned
      delete account1.password
      delete account2.password
      delete account3.password
      delete account4.password
      delete account5.password
      delete account6.password
      yield this.request()
        .get('/accounts')
        .auth('admin', 'admin')
        .expect([account1, account2, account3, account4, account5, account6])
        .expect(validator.validateAccounts)
        .expect(200)
        .end()
    })

    it('should return 401/403 if the user isn\'t an admin', function * () {
      yield this.request()
        .get('/accounts')
        .expect(401)
        .end()
      yield this.request()
        .get('/accounts')
        .auth('alice', 'alice')
        .expect(403)
        .end()
    })
  })

  describe('GET /connectors', function () {
    it('should return 200', function * () {
      yield this.request()
        .get('/connectors')
        .expect(200, [
          {
            id: 'http://localhost/accounts/trader',
            name: 'trader',
            connector: 'http://localhost:4321'
          }
        ])
        .expect(validator.validateAccounts)
        .end()
    })
  })

  describe('GET /accounts/:uuid', function () {
    it('should return 200 for an account that exists', function * () {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(validator.validateAccount)
        .end()
    })

    it('should return 404 when the account does not exist', function * () {
      yield this.request()
        .get(this.exampleAccounts.bob.id)
        .auth('admin', 'admin')
        .expect(404)
        .end()
    })

    it('should return 200 + partial data, when not authenticated', function * () {
      yield this.request()
        .get(this.existingAccount.id)
        .expect(200, {
          id: this.existingAccount.id,
          name: this.existingAccount.name,
          ledger: 'http://localhost'
        })
        .expect(validator.validateAccount)
        .end()
    })

    it('should return 404 when not authenticated + nonexistent target', function * () {
      yield this.request()
        .get(this.exampleAccounts.bob.id)
        .expect(404)
        .end()
    })

    it('should return 403 with invalid credentials', function * () {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('bob', 'bob')
        .expect(403)
        .end()
    })

    it('should return partial data for valid but unauthorized credentials', function * () {
      yield this.request()
        .get(this.existingAccount2.id)
        .auth('alice', 'alice')
        .expect(200, {
          id: this.existingAccount2.id,
          name: this.existingAccount2.name,
          ledger: 'http://localhost'
        })
        .expect(validator.validateAccount)
        .end()
    })

    it('should strip out the password field', function * () {
      const account = this.existingAccount
      const accountWithoutPassword = _.clone(account)
      delete accountWithoutPassword.password
      accountWithoutPassword.ledger = 'http://localhost'
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(accountWithoutPassword)
        .expect(validator.validateAccount)
        .end()
    })

    it('should return the balance as a string', function * () {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(function (res) {
          if (typeof res.body.balance !== 'string') {
            throw new Error('Balance should be a string')
          }
        })
        .expect(validator.validateAccount)
        .end()
    })

    it('should return the minimum_allowed_balance as a string', function * () {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(function (res) {
          if (typeof res.body.minimum_allowed_balance !== 'string') {
            throw new Error('minimum_allowed_balance should be a string')
          }
        })
        .expect(validator.validateAccount)
        .end()
    })

    it('should return the disabled field as a boolean for an admin user', function * () {
      yield this.request()
        .get(this.existingAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(function (res) {
          if (typeof res.body.is_disabled !== 'boolean') {
            throw new Error('disabled should be returned as a boolean')
          }
        })
        .expect(validator.validateAccount)
        .end()
    })

    it('sholuld allow an admin user to view a disabled account', function * () {
      yield this.request()
        .get(this.disabledAccount.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(validator.validateAccount)
        .end()
    })

    it('should return a 403 when a non-admin user tries to view a disabled account', function * () {
      yield this.request()
        .get(this.disabledAccount.id)
        .auth('disabled', 'disabled')
        .expect(403)
        .end()
    })

    it('should return 0 as a minimum_allowed_balance', function * () {
      yield dbHelper.addAccounts([this.unspecifiedMinBalance])

      const account = this.unspecifiedMinBalance
      delete account.password
      yield this.request()
        .get(account.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, account, {
          minimum_allowed_balance: '0',
          ledger: 'http://localhost'
        }))
        .expect(validator.validateAccount)
        .end()
    })

    it('should return -infinity as a minimum_allowed_balance', function * () {
      yield dbHelper.addAccounts([this.infiniteMinBalance])

      const account = this.infiniteMinBalance
      delete account.password
      yield this.request()
        .get(account.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, account, {
          minimum_allowed_balance: '-infinity',
          ledger: 'http://localhost'
        }))
        .expect(validator.validateAccount)
        .end()
    })

    it('should return -100 as a minimum_allowed_balance', function * () {
      yield dbHelper.addAccounts([this.finiteMinBalance])

      const account = this.finiteMinBalance
      delete account.password
      yield this.request()
        .get(account.id)
        .auth('admin', 'admin')
        .expect(200)
        .expect(_.assign({}, account, {
          minimum_allowed_balance: '-100',
          ledger: 'http://localhost'
        }))
        .expect(validator.validateAccount)
        .end()
    })
  })

  describe('PUT /accounts/:uuid', function () {
    it('should return 201', function * () {
      const account = this.exampleAccounts.bob
      const withoutPassword = _.omit(account, 'password')
      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(201)
        .expect(withoutPassword)
        .expect(validator.validateAccount)
        .end()

      // Check balances
      expect((yield Account.findByName('bob')).getDataExternal()).to.deep.equal(withoutPassword)
    })

    it('should return 200 if the account already exists', function * () {
      const account = this.existingAccount

      // Update balance
      account.balance = '90'

      // Passwords are not returned
      delete account.password

      yield this.request()
        .put(this.existingAccount.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(200)
        .expect(account)
        .expect(validator.validateAccount)
        .end()

      // Check balances
      const row = yield Account.findByName('alice')
      expect(row.balance).to.equal(90)
    })

    it('should return a 400 if the account name in the URL does not match the account name in the JSON', function * () {
      const existingAccount = this.existingAccount
      const newAccount = this.exampleAccounts.bob

      delete existingAccount.password

      yield this.request()
        .put(newAccount.id)
        .auth('admin', 'admin')
        .send(existingAccount)
        .expect(400)
        .end()
    })

    it('should default minimum_allowed_balance to 0 when unspecified', function * () {
      const noMinBalanceAccount = this.unspecifiedMinBalance
      delete noMinBalanceAccount.password
      yield this.request()
        .put(noMinBalanceAccount.id)
        .auth('admin', 'admin')
        .send(noMinBalanceAccount)
        .expect(201)
        .expect(_.assign({}, noMinBalanceAccount, {
          minimum_allowed_balance: '0'
        }))
        .expect(validator.validateAccount)
        .end()
    })

    it('should allow "-infinity" as a valid minimum_allowed_balance', function * () {
      const infiniteMinBalanceAccount = this.infiniteMinBalance
      delete infiniteMinBalanceAccount.password
      yield this.request()
        .put(infiniteMinBalanceAccount.id)
        .auth('admin', 'admin')
        .send(infiniteMinBalanceAccount)
        .expect(201)
        .expect(infiniteMinBalanceAccount)
        .expect(validator.validateAccount)
        .end()
    })

    it('should allow the user to specify a minimum_allowed_balance', function * () {
      const finiteMinBalanceAccount = this.finiteMinBalance
      delete finiteMinBalanceAccount.password
      yield this.request()
        .put(finiteMinBalanceAccount.id)
        .auth('admin', 'admin')
        .send(finiteMinBalanceAccount)
        .expect(201)
        .expect(finiteMinBalanceAccount)
        .expect(validator.validateAccount)
        .end()
    })

    it('should allow admin user to disable an account', function * () {
      const uri = 'http://localhost/accounts/abbey'
      const account = {
        name: 'abbey',
        balance: '50',
        password: 'password01'
      }
      const updatedAccount = {
        name: account.name,
        is_disabled: true
      }
      const expected = {
        balance: '50',
        id: 'http://localhost/accounts/abbey',
        is_disabled: true,
        ledger: 'http://localhost',
        minimum_allowed_balance: '0',
        name: 'abbey'
      }
      yield this.request()  // create "abbey" account
        .put(uri)
        .auth('admin', 'admin')
        .send(account)
        .expect(201)
        .end()
      yield this.request()  // disable "abbey" account
        .put(uri)
        .auth('admin', 'admin')
        .send(updatedAccount)
        .expect(200)
        .end()
      yield this.request()  // check "abbey" account
        .get(uri)
        .auth('admin', 'admin')
        .expect(expected)
        .end()
    })

    it('should lowercase account name -- uppercased in url', function * () {
      const lowerCased = this.exampleAccounts.bob
      const account = _.assign({}, lowerCased, {id: lowerCased.id.toUpperCase()})
      const withoutPassword = _.omit(lowerCased, 'password')

      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(201)
        .expect(withoutPassword)
        .expect(validator.validateAccount)
        .end()

      // Check balances
      expect((yield Account.findByName('bob')).getDataExternal()).to.deep.equal(withoutPassword)
    })

    it('should lowercase account name -- uppercased in body', function * () {
      const lowerCased = this.exampleAccounts.bob
      const account = _.assign({}, lowerCased, {name: lowerCased.name.toUpperCase()})
      const withoutPassword = _.omit(lowerCased, 'password')

      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(201)
        .expect(withoutPassword)
        .expect(validator.validateAccount)
        .end()

      // Check balances
      expect((yield Account.findByName('bob')).getDataExternal()).to.deep.equal(withoutPassword)
    })

    it('should lowercase account name -- omit id in body', function * () {
      const lowerCased = this.exampleAccounts.bob
      const account = _.assign({}, lowerCased, {name: lowerCased.name.toUpperCase()})
      const withoutPassword = _.omit(lowerCased, 'password')

      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(_.omit(account, 'id'))
        .expect(201)
        .expect(withoutPassword)
        .expect(validator.validateAccount)
        .end()

      // Check balances
      expect((yield Account.findByName('bob')).getDataExternal()).to.deep.equal(withoutPassword)
    })

    it('should return 400 if name and id are omitted in body', function * () {
      const account = this.exampleAccounts.bob

      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(_.omit(account, ['name', 'id']))
        .expect(400)
        .end()
    })

    it('should allow creating account without password then setting password', function * () {
      const account = this.exampleAccounts.bob

      // create account without password or fingerprint
      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send({name: account.name, balance: '50'})
        .expect(201)
        .end()

      // now try to set a password for the account
      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send({name: account.name, password: 'password'})
        .expect(200)
        .end()
    })
  })

  describe('PUT /accounts/:uuid with public_key', function () {
    it('should return 201', function * () {
      const account = this.exampleAccounts.eve
      account.public_key = publicKey
      delete account.password
      yield this.request()
        .put(account.id)
        .auth('admin', 'admin')
        .send(account)
        .expect(function (res) {
          expect(res.body.name).to.equal('eve')
          // public_key is not returned
          expect(res.body.public_key).to.equal(undefined)
        })
        .expect(201)
        .expect(validator.validateAccount)
        .end()

      // Check balances
      const user = (yield Account.findByName('eve'))
      expect(user.public_key).to.equal(publicKey)
    })
  })
})
