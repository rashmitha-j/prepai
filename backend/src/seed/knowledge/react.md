---
id: kb-react
title: React
topic: react
source: PrepAI Knowledge Base — React
---

# React

## Core Concepts

React is a library for building user interfaces from components — functions that receive props and return a description of UI (JSX). UI is a function of state: when state changes, React re-renders the component and updates the DOM efficiently. Data flows one way, from parent to child through props; children communicate upward through callback props.

JSX compiles to function calls (React.createElement or the automatic JSX runtime). Expressions go inside braces; className replaces class; lists need a stable key prop.

## Virtual DOM and Reconciliation

React keeps a lightweight tree of elements and, on each render, diffs the new tree against the previous one (reconciliation) to compute minimal DOM updates. Heuristics: elements of different types produce different trees, and keys identify list items across renders. Using array indexes as keys breaks state when items are reordered or inserted; use stable IDs.

React Fiber is the reconciliation engine that splits rendering work into units, enabling interruption and prioritisation. React 18 introduced concurrent rendering features (useTransition, useDeferredValue) and automatic batching of state updates, including inside promises and timeouts.

## State and Props

Props are read-only inputs owned by the parent. State is data owned by a component that changes over time. Updating state with the setter schedules a re-render; state updates are asynchronous and batched, so use the functional form setCount(c => c + 1) when the new state depends on the old. Never mutate state directly — create new objects/arrays so React detects changes.

Lifting state up moves shared state to the closest common ancestor. Derived values should be computed during render rather than stored in state.

## Hooks

Hooks let function components use state and lifecycle features. Rules: call hooks only at the top level (not in loops or conditions) and only from components or custom hooks, so React can associate hook state with call order.

- useState: local state.
- useEffect: synchronise with external systems (subscriptions, fetching, timers) after render. The dependency array controls when it re-runs; returning a function cleans up before re-running and on unmount. Missing dependencies cause stale closures.
- useLayoutEffect: runs synchronously after DOM mutations before paint, for measurements.
- useRef: a mutable container that persists across renders without causing re-renders; also holds DOM references.
- useMemo: memoise an expensive computed value. useCallback: memoise a function identity, useful when passing callbacks to memoised children.
- useContext: read a context value without prop drilling.
- useReducer: manage complex state transitions with a reducer function (state, action) -> newState.

Custom hooks extract reusable stateful logic (useAuth, useFetch, useDebounce) and must start with "use".

## Rendering Behaviour and Performance

A component re-renders when its state changes, its parent re-renders, or a context it uses changes. Re-rendering is usually cheap; optimise only measured problems. Tools: React.memo to skip re-rendering when props are shallowly equal, useMemo/useCallback for stable references, splitting context to reduce broad updates, list virtualisation for long lists, and code splitting with React.lazy and Suspense. The React DevTools profiler shows what rendered and why.

## Forms

Controlled components store input values in React state and update on change, giving a single source of truth and easy validation. Uncontrolled components keep values in the DOM and read them through refs; they are simpler for basic forms and file inputs.

## Context and State Management

Context passes data deeply (theme, authenticated user) without prop drilling. It is not a full state manager: every consumer re-renders when the value changes. For complex global state, use useReducer with context or libraries such as Redux Toolkit or Zustand. Server state (fetched data) is best handled by libraries like React Query that cache, deduplicate and revalidate.

## Data Fetching

Fetch in effects with cleanup to ignore responses after unmount or when inputs change (avoid race conditions with an ignore flag or AbortController). Show loading, error and empty states explicitly. Avoid waterfalls by fetching in parallel.

## Routing and Authentication

React Router maps URL paths to components, supports nested routes, route parameters (useParams) and navigation (useNavigate). Protected routes check authentication state and redirect unauthenticated users to login while preserving the original destination. The client-side check is only for UX; the server must enforce authorisation on every request.

## Error Boundaries and Security

Error boundaries (class components implementing componentDidCatch/getDerivedStateFromError) catch rendering errors in their subtree and show a fallback UI. React escapes values rendered in JSX, preventing most XSS; dangerouslySetInnerHTML bypasses that and must only be used with sanitised content.

## Class Components vs Function Components

Class components use this.state and lifecycle methods (componentDidMount, componentDidUpdate, componentWillUnmount). Function components with hooks are the modern standard: less boilerplate, easier logic reuse through custom hooks.
