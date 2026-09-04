# 网络延迟时间 LeetCode 743(Dijkstra)

**难度**：中等 ｜ **分类**：图论 ｜ **标签**：最短路 / Dijkstra

## 题目描述

有 n 个网络节点,标记为 1 到 n。给你一个列表 times,表示信号经过有向边的传递时间。times[i] = (u_i, v_i, w_i),其中 u_i 是源节点,v_i 是目标节点,w_i 是一个信号从源节点传递到目标节点的时间。
现在,从某个节点 k 发出一个信号。需要多久才能使**所有节点**都收到信号?如果不能使所有节点收到信号,返回 -1。

**示例**
```
输入: times = [[2,1,1],[2,3,1],[3,4,1]], n = 4, k = 2
输出: 2        (2→1 用1, 2→3 用1, 3→4 用1;最后一个收到的是4,用时1+1=2)
```

<!-- @题解 -->

## 思路与图解

单源最短路,边权为正 → **Dijkstra**。用优先队列(小顶堆)不断取出"当前距离最短的未确定节点",松弛其邻居。所有节点都确定后,最远距离就是答案。

```
图:  2 --1--> 1       起点 k=2
     2 --1--> 3
     3 --1--> 4

dist 初始: [∞, 0, ∞, ∞](1..4)
堆: (0,2)
 弹出(0,2):松弛 → dist[1]=1, dist[3]=1,堆[(1,1),(1,3)]
 弹出(1,3):松弛 → dist[4]=2,堆[(1,1),(2,4)]
 弹出(1,1):无新松弛
 弹出(2,4):结束
dist = [1, 0, 1, 2] → 最远 2 ✓(所有节点都可达)

图解(一轮轮确定最短距离):
  起点2 ──→ 1 (1)
     │
     └─→ 3 ──→ 4 (2)
   每轮从"已确定集合"向外扩展一条最短边,直到全部确定
```

若某些节点 dist 仍为 ∞,说明不可达,返回 -1。

## 复杂度

- 时间:O(E log V),堆优化 Dijkstra
- 空间:O(V + E)

## 参考代码

### C++

```cpp
class Solution {
public:
    int networkDelayTime(vector<vector<int>>& times, int n, int k) {
        vector<vector<pair<int, int>>> adj(n + 1);
        for (auto& t : times) adj[t[0]].push_back({t[1], t[2]});
        vector<int> dist(n + 1, INT_MAX);
        dist[k] = 0;
        priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> pq;  // 小顶堆
        pq.push({0, k});
        while (!pq.empty()) {
            auto [d, u] = pq.top(); pq.pop();
            if (d > dist[u]) continue;            // 过期记录
            for (auto [v, w] : adj[u]) {
                if (d + w < dist[v]) {
                    dist[v] = d + w;
                    pq.push({dist[v], v});
                }
            }
        }
        int ans = 0;
        for (int i = 1; i <= n; i++) {
            if (dist[i] == INT_MAX) return -1;    // 有节点不可达
            ans = max(ans, dist[i]);
        }
        return ans;
    }
};
```

### Python

```python
class Solution:
    def networkDelayTime(self, times: List[List[int]], n: int, k: int) -> int:
        import heapq
        adj = [[] for _ in range(n + 1)]
        for u, v, w in times:
            adj[u].append((v, w))
        dist = [float('inf')] * (n + 1)
        dist[k] = 0
        pq = [(0, k)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue
            for v, w in adj[u]:
                nd = d + w
                if nd < dist[v]:
                    dist[v] = nd
                    heapq.heappush(pq, (nd, v))
        ans = max(dist[1:])
        return -1 if ans == float('inf') else ans
```

## 小结

- **正权单源最短路 → Dijkstra;负权 → Bellman-Ford/SPFA;多源/任意两点 → Floyd**。
- Dijkstra 贪心依据:堆里取出的最短距离不会再被更新(边权非负)。
- 堆优化三件套:`dist`、小顶堆、`d > dist[u]` 过期跳过。
