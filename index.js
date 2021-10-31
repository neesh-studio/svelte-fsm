export default function (state, states = {}) {
  /*
   * Core Finite State Machine functionality
   * - adheres to Svelte store contract (https://svelte.dev/docs#Store_contract)
   * - invoked events are dispatched to handler of current state
   * - transitions to returned state (or value if static property)
   * - calls _exit() and _enter() methods if they are defined on exited/entered state
   */
  const subscribers = new Set();

  function subscribe(callback) {
    subscribers.add(callback);
    callback(state);
    return () => subscribers.delete(callback);
  }

  function transition(newState) {
    dispatch('_exit');
    state = newState;
    subscribers.forEach((callback) => callback(state));
    dispatch('_enter');
  }

  function dispatch(event, ...args) {
    const value = states[state]?.[event];
    return value instanceof Function ? value(...args) : value;
  }

  function invoke(event, ...args) {
    const newState = dispatch(event, ...args);
    if (newState !== undefined && newState !== state) {
      transition(newState);
    }
    return state;
  }

  dispatch('_init');

  /*
   * Debounce functionality
   * - debounce is lazily bound to dynamic event invoker methods (see Proxy section below)
   * - event.debounce(wait, ...args) calls event with args after wait ms (unless called again first)
   * - cancels all prior invocations (based on prop name) even if called with different wait values
   */
  const timeout = {};

  async function debounce(event, wait = 100, ...args) {
    clearTimeout(timeout[event]);
    await new Promise((resolve) => timeout[event] = setTimeout(resolve, wait));
    delete timeout[event];
    return invoke(event, ...args);
  }

  /*
   * Proxy-based event invocation API:
   * - return a proxy object with single native subscribe method
   * - all other properties act as dynamic event invocation methods
   * - event invokers also respond to .debounce(wait, ...args) (see above)
   * - subscribe() also behaves as an event invoker when called with any args other than a
   *   single callback (or when debounced)
   */
  function subscribeOrInvoke(...args) {
    if (args.length === 1 && args[0] instanceof Function) {
      return subscribe(args[0]);
    } else {
      invoke('subscribe', ...args);
    }
  }

  subscribeOrInvoke.debounce = debounce.bind(null, 'subscribe');

  return new Proxy({ subscribe: subscribeOrInvoke }, {
    get(target, property) {
      if (!Reflect.has(target, property)) {
        target[property] = invoke.bind(null, property);
        target[property].debounce = debounce.bind(null, property);
      }
      return Reflect.get(target, property);
    }
  });
}
