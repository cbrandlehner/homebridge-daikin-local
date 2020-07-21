function Cache(expiration /* seconds */) {
  this.entries = {};
  this.expiration = 5;

  if (expiration != null) {
    this.expiration = expiration;
  }
}

Cache.prototype.get = function(key) {
  const entry = this.entries[key];

  if (entry != null) {
    return entry.value;
  }

  return undefined;
}

Cache.prototype.set = function(key, value) {
  const timestamp = Date.now();

  this.entries[key] = {
    key,
    value,
    timestamp
  };
}

Cache.prototype.has = function(key) {
  return this.entries[key] != null;
}

Cache.prototype.remove = function(key) {
  delete this.entries[key];
}

Cache.prototype.expired = function(key) {
  if (!this.has(key)) {
    return true;
  }

  const entry = this.get(key);
  const delta = Math.abs(entry.timestamp - Date.now()) / 1000;
  const seconds = delta % 60;

  if (seconds > this.expiration) {
    this.remove(key);
    return true;
  }

  return false;
}

module.exports = Cache;
