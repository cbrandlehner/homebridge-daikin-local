function Queue() {
  this.queue = [];
  this.running = false;
}

Queue.prototype.add = function (callback) {
  this.queue.push(() => {
    const next = this.next.bind(this);
    callback(next);
  });

  if (!this.running)
    this.next();

  return this;
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
