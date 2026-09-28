---
id: kb-javascript
title: JavaScript
topic: javascript
source: PrepAI Knowledge Base — JavaScript
---

# JavaScript

## Types and Values

JavaScript has seven primitive types — string, number, bigint, boolean, undefined, null, symbol — plus objects (including arrays and functions). Primitives are immutable and compared by value; objects are compared by reference. typeof null returns "object" due to a historical bug.

== performs type coercion before comparing ("1" == 1 is true); === compares without coercion and is almost always preferred. NaN is not equal to itself; use Number.isNaN. Falsy values: false, 0, -0, 0n, "", null, undefined and NaN.

## var, let and const

var is function-scoped and hoisted with the value undefined. let and const are block-scoped and hoisted into a temporal dead zone — accessing them before declaration throws a ReferenceError. const prevents reassignment of the binding but does not make objects immutable (use Object.freeze for a shallow freeze).

## Scope, Hoisting and Closures

Function declarations are fully hoisted; function expressions assigned to var are hoisted only as undefined.

A closure is a function that remembers the variables of the scope where it was created, even after that scope has returned. Closures enable data privacy (module pattern), function factories, memoization, and callbacks that retain state. Classic pitfall: using var in a loop that creates callbacks — all callbacks share one variable; let creates a new binding per iteration.

## this

this is determined by how a function is called: as a method (obj.fn() -> obj), as a plain function (undefined in strict mode, globalThis otherwise), with new (the new object), or explicitly with call, apply and bind. Arrow functions do not have their own this; they capture it lexically from the enclosing scope, which makes them convenient for callbacks but unsuitable as object methods that need dynamic this.

## Prototypes and Classes

Objects inherit from other objects through the prototype chain. Property lookup walks up the chain until found or reaching null. class syntax is syntactic sugar over prototypes: methods live on Class.prototype, and extends sets up the chain. Object.create(proto) creates an object with a given prototype.

## The Event Loop

JavaScript runs on a single thread with a call stack. Asynchronous operations (timers, network, I/O) are handled by the host environment (browser or Node.js libuv), which queues callbacks when they complete.

After the call stack empties, the event loop first drains the microtask queue (promise callbacks, queueMicrotask, MutationObserver), then takes the next macrotask (setTimeout, setInterval, I/O callbacks, UI events). Therefore:

console.log(1); setTimeout(() => console.log(2), 0); Promise.resolve().then(() => console.log(3)); console.log(4);

prints 1, 4, 3, 2. Long synchronous work blocks the loop and freezes the UI or server; split it or move it to a worker.

## Promises and async/await

A promise represents a future value and is pending, fulfilled or rejected. then/catch/finally chain handlers. Promise.all rejects on the first failure and resolves when all succeed; Promise.allSettled waits for every result; Promise.race settles with the first; Promise.any resolves with the first success.

async functions always return a promise; await pauses the function until the promise settles, without blocking the thread. Use try/catch for errors. Awaiting inside a loop runs operations sequentially; use Promise.all for independent operations to run them concurrently. Unhandled rejections should always be caught.

## Functions and Functional Patterns

Higher-order functions take or return functions: map, filter, reduce, forEach. Currying transforms f(a, b) into f(a)(b). Debounce delays execution until activity stops (search input); throttle limits execution to once per interval (scroll handlers). Pure functions have no side effects and return the same output for the same input.

## Copying Objects

Spread ({...obj}) and Object.assign create shallow copies — nested objects are still shared. structuredClone(obj) creates a deep copy for most data types. JSON.parse(JSON.stringify(obj)) loses functions, undefined, Dates and Maps.

## Modules

ES modules use import/export, are statically analysable (enabling tree shaking) and load asynchronously. CommonJS (require/module.exports) is synchronous and was Node.js's original system. Both are supported in modern Node.js.

## Memory and Performance

JavaScript uses garbage collection (mark-and-sweep): unreachable objects are freed. Leaks occur through forgotten timers, global variables, detached DOM nodes held in variables, and ever-growing caches or listeners. WeakMap and WeakRef hold references without preventing collection.

## DOM and Browser

Event propagation has a capture phase and a bubble phase. Event delegation attaches one listener to a parent and uses event.target, which is efficient for many children. preventDefault stops default browser behaviour; stopPropagation stops bubbling. Browser storage: cookies (sent with requests), localStorage (persistent, synchronous, per origin) and sessionStorage (per tab). Storing tokens in localStorage exposes them to XSS; sanitise output and use a Content Security Policy.
