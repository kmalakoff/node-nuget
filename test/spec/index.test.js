var assert = require('assert');

var nuget = require('../..');

describe('node-nuget', function () {
  it('exists', function () {
    assert.equal(typeof nuget, 'function');
  });
});
