'use strict'

const knex = require('../../src/lib/knex').knex
const knexConfig = require('../../src/lib/knex').config
const Account = require('../../src/models/db/account').Account
const Transfer = require('../../src/models/db/transfer').Transfer
const Subscription = require('../../src/models/db/subscription').Subscription
const Notification = require('../../src/models/db/notification').Notification
const Fulfillment = require('../../src/models/db/conditionFulfillment').ConditionFulfillment

const tables = [
  'accounts',
  'fulfillments',
  'entries',
  'notifications',
  'subscriptions',
  'transfers'
]

const migrationTables = [
  'migrations',
  'migrations_lock'
]

// Only run migrations once during tests
let init = false
exports.init = function * () {
  if (init) return
  for (let t of tables.concat(migrationTables)) {
    yield knex.schema.dropTableIfExists(t).then()
  }

  yield knex.migrate.latest(knexConfig).then()
  init = true
  return
}

exports.clean = function * () {
  for (let t of tables) {
    yield knex(t).truncate().then()
  }
}

exports.addAccounts = function * (accounts) {
  if (!Array.isArray(accounts)) {
    throw new Error('Requires an array of accounts, got ' + accounts)
  }
  yield Account.bulkCreateExternal(accounts)
}

exports.addTransfers = function * (transfers) {
  if (!Array.isArray(transfers)) {
    throw new Error('Requires an array of transfers, got ' + transfers)
  }
  yield Transfer.bulkCreateExternal(transfers)
}

exports.addSubscriptions = function * (subscriptions) {
  if (!Array.isArray(subscriptions)) {
    throw new Error('Requires an array of subscriptions, got ' + subscriptions)
  }
  yield Subscription.bulkCreateExternal(subscriptions)
}

exports.addNotifications = function * (notifications) {
  if (!Array.isArray(notifications)) {
    throw new Error('Requires an array of notifications, got ' + notifications)
  }
  for (let i = 0; i < notifications.length; i++) {
    yield Notification.create(notifications[i])
  }
}

exports.addFulfillments = function * (fulfillments) {
  if (!Array.isArray(fulfillments)) {
    throw new Error('Requires an array of fulfillments, got ' + fulfillments)
  }
  for (let i = 0; i < fulfillments.length; i++) {
    yield Fulfillment.create(fulfillments[i])
  }
}
