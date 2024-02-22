var assert = require('assert');

var nuget = require('nuget');

describe('node-nuget', () => {
  it('exists', () => {
    assert.equal(typeof nuget, 'function');
  });
});
