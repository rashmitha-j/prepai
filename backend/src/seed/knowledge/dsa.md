---
id: kb-dsa
title: Data Structures and Algorithms
topic: dsa
source: PrepAI Knowledge Base — DSA
---

# Data Structures and Algorithms

## Complexity Analysis

Big-O describes how running time or memory grows with input size n, ignoring constants and lower-order terms. Common classes from fastest to slowest: O(1), O(log n), O(n), O(n log n), O(n^2), O(2^n), O(n!). Interviewers expect you to state both time and space complexity, and to distinguish worst case, average case and amortized cost.

Amortized analysis averages the cost of an operation over a sequence. A dynamic array (std::vector, JavaScript Array) doubles its capacity when full; a single push can cost O(n) for the copy, but n pushes cost O(n) total, so each push is amortized O(1).

Recursion uses stack space proportional to recursion depth. A recursive DFS on a skewed tree of n nodes uses O(n) stack space, which can overflow for large inputs; an explicit stack avoids that.

## Arrays and Strings

Arrays give O(1) random access and cache-friendly iteration. Inserting or deleting in the middle is O(n) because elements shift.

Two pointers: use two indices moving toward each other or in the same direction. Typical uses: reversing, checking palindromes, pair sum in a sorted array, removing duplicates in place, merging sorted arrays.

Sliding window: maintain a window [left, right] and a running aggregate. Expand right, shrink left while the window violates a constraint. Solves longest substring without repeating characters, minimum window substring and maximum sum subarray of size k in O(n).

Prefix sums: prefix[i] = sum of the first i elements; range sum (l, r) = prefix[r+1] - prefix[l] in O(1). Combined with a hash map of prefix counts, it solves "number of subarrays with sum k" in O(n).

Kadane's algorithm finds the maximum subarray sum in O(n): keep the best sum ending at the current index, current = max(x, current + x), and track the global maximum.

## Hash Tables

A hash table maps keys to buckets through a hash function. Average O(1) insert, lookup and delete; worst case O(n) when many keys collide. Collisions are handled by chaining (linked lists per bucket) or open addressing (probing). The load factor (entries / buckets) triggers resizing to keep operations fast.

Use hashing for frequency counting, deduplication, two-sum, grouping anagrams, and memoization. In C++ unordered_map is a hash table while map is a balanced BST with O(log n) ordered operations.

## Linked Lists

Singly linked lists allow O(1) insertion and deletion given a node pointer but O(n) access by index. Classic techniques: a dummy head node to simplify edge cases; fast and slow pointers to find the middle, detect a cycle (Floyd's algorithm) and find the cycle start; iterative reversal with three pointers (prev, curr, next).

## Stacks and Queues

A stack is LIFO; a queue is FIFO. Stacks power expression evaluation, balanced parentheses, undo operations and iterative DFS. A monotonic stack keeps elements in increasing or decreasing order and solves "next greater element" and "largest rectangle in histogram" in O(n). A deque supports O(1) operations at both ends and implements the sliding window maximum.

## Trees

A binary tree node has at most two children. Traversals: preorder (root, left, right), inorder (left, root, right), postorder (left, right, root) and level order (BFS with a queue).

A binary search tree keeps left subtree < node < right subtree, so inorder traversal is sorted. Search, insert and delete are O(h) where h is height; a skewed BST degrades to O(n). Self-balancing trees (AVL, red-black) guarantee O(log n) height.

Common interview problems: maximum depth, diameter, validating a BST using min/max bounds, lowest common ancestor, serializing and deserializing a tree, and path sums.

## Heaps and Priority Queues

A binary heap is a complete binary tree stored in an array where each parent is smaller (min-heap) or larger (max-heap) than its children. Insert and extract are O(log n), peek is O(1), and building a heap from n elements is O(n). Use heaps for top-k elements (keep a min-heap of size k), merging k sorted lists, running median (two heaps) and Dijkstra's algorithm.

## Graphs

Graphs are represented with adjacency lists (O(V + E) space, good for sparse graphs) or adjacency matrices (O(V^2), O(1) edge lookup).

BFS explores level by level with a queue and finds shortest paths in unweighted graphs. DFS explores deeply with recursion or a stack and is used for connected components, cycle detection and topological sort.

Topological sort orders a directed acyclic graph so every edge goes from earlier to later. Kahn's algorithm repeatedly removes nodes with in-degree zero; if not all nodes are removed, the graph has a cycle (useful for course schedule problems).

Dijkstra's algorithm computes shortest paths with non-negative weights in O((V + E) log V) using a min-heap. Bellman-Ford handles negative edges in O(VE) and detects negative cycles. Union-Find (disjoint set union) with path compression and union by rank answers connectivity queries in near O(1) and powers Kruskal's minimum spanning tree.

## Sorting and Searching

Merge sort is O(n log n) in all cases, stable, and uses O(n) extra space. Quick sort is O(n log n) on average, O(n^2) in the worst case, in-place, and not stable; random pivots avoid the worst case in practice. Heap sort is O(n log n) and in-place but not stable. Counting sort and radix sort run in linear time for bounded integer keys.

Binary search finds a target in a sorted array in O(log n). Beyond exact lookup, it applies to "search on the answer": find the smallest value x such that a monotonic predicate(x) is true, e.g. minimum capacity to ship packages within D days. Watch for off-by-one errors and use mid = low + (high - low) / 2 to avoid overflow.

## Recursion, Backtracking and Dynamic Programming

Backtracking builds candidates incrementally and abandons a branch as soon as it cannot lead to a valid solution. It solves permutations, combinations, subsets, N-Queens and Sudoku. Complexity is usually exponential, so pruning matters.

Dynamic programming applies when a problem has overlapping subproblems and optimal substructure. Top-down DP is recursion with memoization; bottom-up DP fills a table iteratively and often allows space optimization. Steps: define the state, write the transition, set base cases, choose the iteration order.

Classic DP problems: climbing stairs and Fibonacci (1D), 0/1 knapsack, longest common subsequence and edit distance (2D over two strings), longest increasing subsequence (O(n^2) DP or O(n log n) with patience sorting), coin change (unbounded knapsack) and matrix path counting.

Greedy algorithms make the locally optimal choice at each step. They are correct only when the problem has the greedy-choice property, for example interval scheduling by earliest end time or Huffman coding. Always justify a greedy approach with an exchange argument or a counterexample check.

## Interview Approach

Clarify inputs, constraints and edge cases first. State a brute-force solution and its complexity, then optimize. Talk through the approach before coding, test with a small example, and check edge cases: empty input, single element, duplicates, negative numbers and overflow.
