# 冗余连接 LeetCode 684(并查集)

**难度**：中等 ｜ **分类**：图论 ｜ **标签**：并查集

## 题目描述

树可以看成是一个连通且无环的无向图。给定往一棵 n 个节点(节点值 1~n)的树中添加一条边后的图。添加的边的两个顶点包含在 1 到 n 中间,且这条附加的边不属于树中已存在的边。图的信息记录于长度为 n 的二维数组 edges,edges[i] = [a_i, b_i] 表示图中在 a_i 和 b_i 之间存在一条边。
请找出一条可以删去的边,删除后可让剩余部分是一个有着 n 个节点的树。如果有多个答案,则返回数组 edges 中最后出现的那个。

**示例**
```
输入: edges = [[1,2],[1,3],[2,3]]
输出: [2,3]
```

<!-- @题解 -->

## 思路与图解

并查集(Union-Find):维护"连通分量"。**依次把每条边两端的节点 union;若某条边两端本来就在同一集合,说明加它会成环,这条边就是冗余边**。

```
edges = [1-2, 1-3, 2-3]

1-2: 1 和 2 不同集合 → union → {1,2}
1-3: 1 和 3 不同集合 → union → {1,2,3}
2-3: 2 和 3 已在同一集合 → 成环!返回 [2,3] ✓

图解(加第3条边前):
   1 ── 2
   │
   3       1,2,3 已在同一连通块,再加 2-3 必成环
```

**路径压缩 + 按秩合并**让 find 近似 O(1)。

## 复杂度

- 时间:O(n·α(n)),α 为反阿克曼函数,近似常数
- 空间:O(n)

## 参考代码

### C++

```cpp
class Solution {
public:
    vector<int> parent;
    int find(int x) {
        while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }  // 路径压缩
        return x;
    }
    vector<int> findRedundantConnection(vector<vector<int>>& edges) {
        int n = edges.size();
        parent.resize(n + 1);
        for (int i = 1; i <= n; i++) parent[i] = i;
        for (auto& e : edges) {
            int a = find(e[0]), b = find(e[1]);
            if (a == b) return e;          // 已连通 → 成环冗余
            parent[a] = b;
        }
        return {};
    }
};
```

### Python

```python
class Solution:
    def findRedundantConnection(self, edges: List[List[int]]) -> List[int]:
        n = len(edges)
        parent = list(range(n + 1))
        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for u, v in edges:
            a, b = find(u), find(v)
            if a == b:
                return [u, v]
            parent[a] = b
        return []
```

## 小结

- 并查集三操作:**init / find(路径压缩) / union**,是"连通性、环检测、最小生成树"的基础工具。
- 本题是 685 冗余连接 II(有向图)的铺垫;Kruskal 最小生成树(1584)也用它。
- 路径压缩后 find 摊还 O(α(n)),可放心用于百万级节点。
