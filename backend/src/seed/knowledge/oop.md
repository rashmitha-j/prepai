---
id: kb-oop
title: Object-Oriented Programming
topic: oop
source: PrepAI Knowledge Base — OOP
---

# Object-Oriented Programming

## Core Idea

Object-oriented programming models software as objects that bundle state (fields) with behaviour (methods). A class is a blueprint; an object is an instance. OOP aims to manage complexity through modularity, reuse and clear boundaries between components.

## The Four Pillars

Encapsulation: hide internal state behind a public interface and control access with access modifiers (private, protected, public). Invariants are enforced by methods rather than by callers, e.g. a BankAccount exposes deposit() and withdraw() instead of letting callers set the balance directly.

Abstraction: expose what an object does, not how. Abstract classes and interfaces define contracts; callers depend on the contract, not the implementation. Abstraction reduces what a user of a class must understand.

Inheritance: a subclass derives from a base class and reuses or extends its behaviour ("is-a" relationship). Deep hierarchies become rigid; the fragile base class problem means changes in a parent can break children. Prefer composition ("has-a") when you only need to reuse behaviour.

Polymorphism: one interface, many implementations. Compile-time (static) polymorphism is achieved with method overloading and templates/generics. Runtime (dynamic) polymorphism is achieved with method overriding: a base-class reference calls the subclass implementation, resolved at runtime.

## Runtime Polymorphism in C++

In C++, a function must be declared virtual for overriding to be dispatched at runtime. Each class with virtual functions has a vtable (table of function pointers) and each object stores a hidden vptr to its class's vtable. Calling a virtual function through a base pointer looks up the vtable at runtime. A base class used polymorphically must have a virtual destructor; otherwise deleting a derived object through a base pointer is undefined behaviour and may leak resources. A pure virtual function (= 0) makes a class abstract.

Object slicing happens when a derived object is copied into a base object by value — the derived part is sliced off. Use references or pointers for polymorphism.

## Overloading vs Overriding

Overloading: same method name, different parameter lists, in the same scope, resolved at compile time. Overriding: a subclass provides a new implementation of a base-class method with the same signature, resolved at runtime.

## Abstract Classes vs Interfaces

An abstract class can hold state and partial implementations, and a class usually extends only one. An interface defines a pure contract; a class can implement many. In Java 8+, interfaces can have default methods. C++ uses abstract classes with pure virtual functions to model interfaces.

## Constructors, Destructors and RAII

Constructors initialise objects; destructors release resources. C++ RAII (Resource Acquisition Is Initialization) ties a resource's lifetime to an object's scope: smart pointers (unique_ptr, shared_ptr), lock_guard and file handles release resources automatically, even when exceptions are thrown. The rule of three/five: if a class manages a resource and defines a destructor, it usually also needs a copy constructor, copy assignment, move constructor and move assignment. Shallow copy shares the same underlying resource; deep copy duplicates it.

## SOLID Principles

- Single Responsibility: a class should have one reason to change.
- Open/Closed: open for extension, closed for modification — add behaviour through new classes (e.g. new PaymentMethod implementations) rather than editing existing switch statements.
- Liskov Substitution: subtypes must be usable wherever the base type is expected without breaking correctness. The classic violation: Square extending Rectangle breaks callers that set width and height independently.
- Interface Segregation: prefer several small, focused interfaces over one large one.
- Dependency Inversion: high-level modules depend on abstractions, not concrete implementations; inject dependencies. This makes testing with mocks easy.

## Coupling and Cohesion

Good design has high cohesion (a module's responsibilities are closely related) and low coupling (modules depend on each other minimally, through stable interfaces).

## Common Design Patterns

Creational: Singleton (one instance, e.g. configuration; overuse creates hidden global state and hurts testability), Factory (create objects without exposing the concrete class), Builder (construct complex objects step by step).

Structural: Adapter (convert one interface into another), Decorator (add behaviour by wrapping an object), Facade (simplified interface to a subsystem), Proxy (control access, e.g. lazy loading or caching).

Behavioral: Strategy (swap algorithms at runtime, e.g. different pricing rules), Observer (subscribers notified of events, basis of event emitters and pub/sub), Command (encapsulate a request as an object, enabling undo), Template Method (fixed algorithm skeleton with overridable steps), State (behaviour changes with internal state).

A provider abstraction for AI models — an interface with generate() and embed() plus a factory selecting Ollama or an API vendor from configuration — combines the Strategy and Factory patterns and follows dependency inversion.

## Low-Level Design Interviews

For a low-level design question (parking lot, library system, elevator), clarify requirements, identify entities and their relationships, define class responsibilities and interfaces, choose patterns where they simplify the design, and walk through a use case. Discuss extensibility and concurrency (e.g. two cars claiming the same spot).
