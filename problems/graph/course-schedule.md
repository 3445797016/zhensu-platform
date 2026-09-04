# 课程表 LeetCode 207(拓扑排序)

**难度**：中等 ｜ **分类**：图论 ｜ **标签**：拓扑排序 / 环检测

## 题目描述

你这个学期必须选修 numCourses 门课程,记为 0 到 numCourses - 1。
在选修某些课程之前需要一些先修课程。先修课程按数组 prerequisites 给出,其中 prerequisites[i] = [a_i, b_i],表示如果要学习课程 a_i 则必须先学习课程 b_i。
请你判断是否可能完成所有课程的学习?如果可以,返回 true;否则,返回 false。

**示例**
```
输入: numCourses = 2, prerequisites = [[1,0],[0,1]]
输出: false      (互相依赖形成环,无法完成)
```

<!-- @题解 -->

## 思路与图解

把课程看作**有向图**节点,先修关系是边 `b_i → a_i`。能学完所有课 ⟺ 图**无环**。
**拓扑排序(Kahn 算法)**:统计入度,把所有入度为 0 的节点入队,逐个出队并让后继入度 -1,入度变 0 再入队。出队节点数 = 总节点数 ⟹ 无环。

```
例:5门课,先修: 1→0(学1需先0), 2→0, 3→1, 3→2, 4→3

依赖图:
  0 ← 1 ← 3 ← 4
  ↑      ↑
  2 ─────┘

入度: 0:2  1:1  2:1  3:2  4:0

队列: [4] → 出4,3入度2→1
      [3]? 3入度还>0,不能入
      0,1,2 入度都>0 → 队列空,但只出了1个节点(≠5) → 有环? 不,这里无环
```

更清晰的无环例:
```
边: 1→0, 2→0, 3→1, 3→2, 4→3
入度: 0:2, 1:1, 2:1, 3:1, 4:0
队列 [4] → 出4,3入度0 → [3] → 出3,1入度0、2入度0 → [1,2]
出1,0入度1; 出2,0入度0 → [0] → 出0。共出5个 → 无环 → true ✓

环示意(判 false):
  0 → 1 → 2
  ↑_______↓     所有人入度≥1,队列空 → 无法学完 → false
```

## 复杂度

- 时间:O(V + E),V 课程数、E 先修关系数
- 空间:O(V + E)

## 参考代码

### C++

```cpp
class Solution {
public:
    bool canFinish(int numCourses, vector<vector<int>>& prerequisites) {
        vector<vector<int>> adj(numCourses);
        vector<int> indeg(numCourses, 0);
        for (auto& p : prerequisites) { adj[p[1]].push_back(p[0]); indeg[p[0]]++; }
        queue<int> q;
        for (int i = 0; i < numCourses; i++) if (indeg[i] == 0) q.push(i);
        int cnt = 0;
        while (!q.empty()) {
            int u = q.front(); q.pop(); cnt++;
            for (int v : adj[u]) if (--indeg[v] == 0) q.push(v);
        }
        return cnt == numCourses;         // 全部出队 = 无环
    }
};
```

### Python

```python
class Solution:
    def canFinish(self, numCourses: int, prerequisites: List[List[int]]) -> bool:
        from collections import deque
        adj = [[] for _ in range(numCourses)]
        indeg = [0] * numCourses
        for a, b in prerequisites:      # 学 a 需先学 b → b→a
            adj[b].append(a)
            indeg[a] += 1
        q = deque([i for i in range(numCourses) if indeg[i] == 0])
        cnt = 0
        while q:
            u = q.popleft()
            cnt += 1
            for v in adj[u]:
                indeg[v] -= 1
                if indeg[v] == 0:
                    q.append(v)
        return cnt == numCourses
```

## 小结

- **拓扑排序 = BFS + 入度削边**,常用于依赖/调度问题;能跑完所有节点 ⟺ 无环。
- DFS 环检测(三色标记)是等价解法。
- 210 课程表 II 在此基础上记录出队顺序即得到一种合法学习顺序。
