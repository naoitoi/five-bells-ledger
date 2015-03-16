/*global describe, it*/
'use strict';
var superagent = require('co-supertest');
var expect = require('chai').expect;
var app = require('../app');
var db = require('../services/db');
var dbHelper = require('./helpers/db');

function request() {
  return superagent(app.listen());
}

describe('Subscriptions', function () {
  beforeEach(function *() {
    // Define example data
    this.exampleTransfer = require('./data/transfer1');
    this.exampleSubscription = require('./data/subscription1');
    this.existingSubscription = require('./data/subscription2');

    // Reset database
    yield dbHelper.reset();

    // Store some example data
    yield db.put(['people'], require('./data/people'));
    yield db.create(['subscriptions'], this.existingSubscription);
  });

  describe('GET /subscriptions/:uuid', function () {
    it('should return 200', function *() {
      yield request()
        .get('/subscriptions/'+this.existingSubscription.id)
        .expect(200)
        .expect(this.existingSubscription)
        .end();
    });

    it('should return 404 for a non-existant subscription', function *() {
      yield request()
        .get('/subscriptions/'+this.exampleSubscription.id)
        .expect(404)
        .end();
    });
  });

  describe('POST /subscriptions', function () {
    it('should return 201', function *() {
      yield request()
        .post('/subscriptions')
        .send(this.exampleSubscription)
        .expect(201)
        .expect(this.exampleSubscription)
        .end();

      // Check that the subscription landed in the database
      expect(yield db.get(['people', 'alice', 'subscriptions', this.exampleSubscription.id]))
        .to.deep.equal(this.exampleSubscription);
    });

    it('should return 200 when updating the target URL', function *() {
      this.existingSubscription.target = 'http://192.0.2.1/test2';
      yield request()
        .put('/subscriptions/'+this.existingSubscription.id)
        .send(this.existingSubscription)
        .expect(200)
        .expect(this.existingSubscription)
        .end();

      // Check that the subscription url is changed in the database
      expect(yield db.get(['people', 'bob', 'subscriptions', this.existingSubscription.id]))
        .to.deep.equal(this.existingSubscription);
    });
  //
  //   it('should return 409 if the transfer already exists', function *() {
  //     yield request()
  //       .put('/transfers/'+this.exampleTransfer.id)
  //       .send(this.exampleTransfer)
  //       .expect(201)
  //       .expect(this.exampleTransfer)
  //       .end();
  //
  //     yield request()
  //       .put('/transfers/'+this.exampleTransfer.id)
  //       .send(this.exampleTransfer)
  //       .expect(409)
  //       .end();
  //   });
  //
  //   it('should return 422 if the amount is zero', function *() {
  //     this.exampleTransfer.source.amount = "0";
  //     this.exampleTransfer.destination.amount = "0";
  //     yield request()
  //       .put('/transfers/'+this.exampleTransfer.id)
  //       .send(this.exampleTransfer)
  //       .expect(422)
  //       .end();
  //   });
  //
  //   it('should return 422 if the sender doesn\'t have enough money', function *() {
  //     this.exampleTransfer.source.amount = "101";
  //     this.exampleTransfer.destination.amount = "101";
  //     yield request()
  //       .put('/transfers/'+this.exampleTransfer.id)
  //       .send(this.exampleTransfer)
  //       .expect(422)
  //       .end();
  //   });
  //
  //   it('should return 422 if the sender doesn\'t exist', function *() {
  //     this.exampleTransfer.source.owner = "alois";
  //     yield request()
  //       .put('/transfers/'+this.exampleTransfer.id)
  //       .send(this.exampleTransfer)
  //       .expect(422)
  //       .end();
  //   });
  //
  //   it('should return 422 if the recipient doesn\'t exist', function *() {
  //     this.exampleTransfer.destination.owner = "blob";
  //     yield request()
  //       .put('/transfers/'+this.exampleTransfer.id)
  //       .send(this.exampleTransfer)
  //       .expect(422)
  //       .end();
  //   });
  //
  //   it('should return 422 if source and destination amounts don\'t match', function *() {
  //     this.exampleTransfer.destination.owner = "blob";
  //     yield request()
  //       .put('/transfers/'+this.exampleTransfer.id)
  //       .send(this.exampleTransfer)
  //       .expect(422)
  //       .end();
  //   });
  //
  //   it('should return 403 if the request is unauthorized');
  //   it('should return 403 if the authorization is forged');
  //   it('should return 403 if the authorization is not applicable');
  });

  describe('DELETE /subscriptions/:uuid', function () {
    it('should return 204', function *() {
      yield request()
        .delete('/subscriptions/'+this.existingSubscription.id)
        .expect(204)
        .end();
    });
  });
});
