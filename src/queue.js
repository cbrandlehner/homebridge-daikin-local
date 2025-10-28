/* eslint @stylistic/indent: "off" */

function Queue() {
  this.queue = [];
  this.running = false;
}

Queue.prototype.add = function (callback, prepend) {
  const action = () => {
    const next = this.next.bind(this);
    callback(next);
  };

  if (prepend)
    this.queue.unshift(action);
  else
    this.queue.push(action);

  if (!this.running)
    this.next();

  return this;
};

Queue.prototype.append = function (callback) {
  return this.add(callback, false);
};

Queue.prototype.prepend = function (callback) {
  return this.add(callback, true);
};

Queue.prototype.next = function () {
  this.running = false;

  const next = this.queue.shift();
  if (next) {
    this.running = true;
    next();
  }
};

module.exports = Queue;
