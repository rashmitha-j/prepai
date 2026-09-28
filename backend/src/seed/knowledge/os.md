---
id: kb-os
title: Operating Systems
topic: os
source: PrepAI Knowledge Base — Operating Systems
---

# Operating Systems

## Role of an Operating System

An operating system manages hardware resources and provides abstractions to programs: processes, virtual memory, files and devices. The kernel runs in privileged kernel mode; applications run in user mode and request services through system calls (read, write, fork, mmap). A system call switches into kernel mode, which is more expensive than a normal function call.

## Processes and Threads

A process is a program in execution with its own address space, open files and resources, described by a process control block (PCB). Process states: new, ready, running, waiting (blocked) and terminated.

A thread is the unit of CPU scheduling inside a process. Threads of the same process share code, heap and open files but each has its own stack, registers and program counter. Threads are cheaper to create and switch than processes, but a bug in one thread can corrupt shared memory. Processes are isolated, so a crash does not affect others.

fork() creates a child process that is a copy of the parent (using copy-on-write pages); exec() replaces the process image with a new program. A zombie process has finished but its parent has not collected its exit status with wait(). An orphan process has lost its parent and is adopted by init/systemd.

## Context Switching

A context switch saves the state of the running process or thread and restores another. It costs CPU time and pollutes caches and the TLB. Switching between threads of the same process is cheaper because the address space does not change.

## CPU Scheduling

Goals: high CPU utilization and throughput, low turnaround, waiting and response time, and fairness.

- FCFS (first come, first served): simple, non-preemptive; suffers from the convoy effect.
- SJF (shortest job first): minimal average waiting time but needs burst estimates and can starve long jobs; SRTF is its preemptive form.
- Priority scheduling can starve low-priority processes; aging gradually increases priority to fix this.
- Round robin gives each process a time quantum; a small quantum improves responsiveness but increases context-switch overhead.
- Multilevel feedback queues move processes between queues based on behaviour; interactive jobs stay at high priority.

## Synchronization

A race condition occurs when the result depends on the interleaving of concurrent operations on shared data. The critical section is the code that accesses shared data; a correct solution provides mutual exclusion, progress and bounded waiting.

A mutex is a lock owned by one thread at a time. A semaphore is an integer counter with wait (P) and signal (V) operations; a binary semaphore behaves like a lock without ownership, and a counting semaphore limits access to N instances of a resource. Condition variables let threads wait for a condition while releasing a mutex. Spinlocks busy-wait and are only efficient for very short critical sections on multicore systems.

Classic problems: producer-consumer (bounded buffer with two counting semaphores and a mutex), readers-writers, and dining philosophers.

## Deadlocks

A deadlock is a set of processes each waiting for a resource held by another. It requires four conditions simultaneously (Coffman conditions): mutual exclusion, hold and wait, no preemption, and circular wait.

Handling strategies:
- Prevention: break one condition, e.g. impose a global ordering on lock acquisition to eliminate circular wait, or request all resources at once.
- Avoidance: grant requests only if the system stays in a safe state (Banker's algorithm).
- Detection and recovery: detect cycles in a resource allocation graph, then abort or preempt processes.
- Ignore: many general-purpose OSes assume deadlocks are rare (ostrich approach).

Livelock is when processes keep changing state in response to each other without making progress. Starvation is when a process waits indefinitely because others are always favoured.

## Memory Management

Virtual memory gives each process the illusion of a large private address space. The MMU translates virtual addresses to physical addresses using page tables. Paging divides memory into fixed-size pages and frames, eliminating external fragmentation but causing some internal fragmentation. Segmentation divides memory into variable-size logical segments and can suffer external fragmentation.

The TLB (translation lookaside buffer) caches recent translations. Multi-level page tables reduce memory used by page tables for sparse address spaces.

A page fault occurs when a referenced page is not in physical memory; the OS loads it from disk. Page replacement algorithms: FIFO (can suffer Belady's anomaly), Optimal (theoretical best, replaces the page used farthest in future), and LRU (approximated with reference bits, e.g. the clock algorithm). Thrashing happens when processes spend more time paging than executing because their working sets do not fit in memory.

## Storage and File Systems

A file system maps files and directories onto blocks. Inodes store file metadata and block pointers in Unix systems. Journaling file systems write intended changes to a journal first so the file system can recover consistently after a crash. Disk scheduling algorithms (SSTF, SCAN, C-SCAN) reduce seek time on spinning disks; SSDs have no seek time but have write amplification and wear levelling.

## Interrupts and I/O

Interrupts let hardware signal the CPU asynchronously. Polling repeatedly checks device status and wastes cycles. DMA transfers data between devices and memory without CPU involvement. Blocking I/O suspends the caller; non-blocking and asynchronous I/O (epoll, kqueue, io_uring) let one thread manage many connections — the foundation of Node.js's event loop through libuv.
