# 岛屿数量 LeetCode 200

**难度**：中等 ｜ **分类**：图论 ｜ **标签**：DFS / BFS / 连通分量

## 题目描述

给你一个由 '1'(陆地)和 '0'(水)组成的的二维网格,请你计算网格中岛屿的数量。
岛屿总是被水包围,并且每座岛屿只能由水平方向和/或竖直方向上相邻的陆地连接形成。

**示例**
```
输入: grid = [
  ['1','1','0','0','0'],
  ['1','1','0','0','0'],
  ['0','0','1','0','0'],
  ['0','0','0','1','1']
]
输出: 3
```

<!-- @题解 -->

## 思路与图解

遍历每个格子,遇到 '1' 就计数 +1,并用 DFS/BFS 把这座岛**全部淹没成 '0'**,避免重复计数。淹没次数 = 岛屿数量。

```
grid(1=陆地):
 ①①...
 ①①..1.
 ....1.
 ....11
步骤:遇到(0,0)的1 → 岛数1 → DFS淹没相连的1
     遇到(2,2)的1 → 岛数2 → 淹没
     遇到(3,3)的1 → 岛数3 → 淹没(与(2,3)...)
结果 3 ✓

DFS 淹没示意(从标记 X 的格子向四方向扩散):
  . . . . .
  . X 1 . .     ← 遇到 X
  . 1 1 . .        向上下左右递归,把相连 1 全部变 0
```

四个方向扩散:`(i±1,j)`、`(i,j±1)`;用递归(DFS)或队列(BFS)皆可,边界/越界直接返回。

## 复杂度

- 时间:O(m·n),每个格子至多访问一次
- 空间:O(m·n),最坏递归栈/队列

## 参考代码

### C++

```cpp
class Solution {
public:
    int m, n;
    void dfs(vector<vector<char>>& g, int i, int j) {
        if (i < 0 || j < 0 || i >= m || j >= n || g[i][j] == '0') return;
        g[i][j] = '0';                    // 淹没
        dfs(g, i + 1, j); dfs(g, i - 1, j);
        dfs(g, i, j + 1); dfs(g, i, j - 1);
    }
    int numIslands(vector<vector<char>>& g) {
        m = g.size(); n = g[0].size();
        int cnt = 0;
        for (int i = 0; i < m; i++)
            for (int j = 0; j < n; j++)
                if (g[i][j] == '1') { cnt++; dfs(g, i, j); }
        return cnt;
    }
};
```

### Python

```python
class Solution:
    def numIslands(self, grid: List[List[str]]) -> int:
        m, n = len(grid), len(grid[0])
        def dfs(i, j):
            if i < 0 or j < 0 or i >= m or j >= n or grid[i][j] == '0':
                return
            grid[i][j] = '0'              # 淹没
            dfs(i + 1, j); dfs(i - 1, j)
            dfs(i, j + 1); dfs(i, j - 1)
        cnt = 0
        for i in range(m):
            for j in range(n):
                if grid[i][j] == '1':
                    cnt += 1
                    dfs(i, j)
        return cnt
```

## 小结

- "连通分量计数"统一套路:**遇到未访问节点 → 计数+1 → 遍历整块**。
- 除 DFS/BFS 外也可用**并查集**:把所有相邻的 1 union,最后统计根的数量。
- 延伸:695 岛屿的最大面积、130 被围绕的区域、1020 飞地的数量。
