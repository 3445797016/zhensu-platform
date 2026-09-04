# 组合 LeetCode 77

**难度**：中等 ｜ **分类**：回溯 ｜ **标签**：回溯 + 剪枝

## 题目描述

给定两个整数 n 和 k,返回范围 [1, n] 中所有可能的 k 个数的组合。
你可以按任何顺序返回答案。

**示例**
```
输入: n = 4, k = 2
输出:
[[2,4],[3,4],[2,3],[1,2],[1,3],[1,4]]
```

<!-- @题解 -->

## 思路与图解

组合(无序)与排列(有序)的区别:**组合用 startIndex 限制起点**,每次只从 startIndex 之后取数,天然去重。

回溯的搜索树(取 2 个数,start 只增不减保证不回头):

```
                    取第一个数
     1              2              3          4
    /|\            /|\            /|         (后面不足2个,剪枝)
   2 3 4          3 4            4
 [1,2][1,3][1,4] [2,3][2,4]     [3,4]

递归树形(每个节点=一个选择):
  开始
 ├─取1 → 再取2/3/4 → [1,2][1,3][1,4]
 ├─取2 → 再取3/4   → [2,3][2,4]
 ├─取3 → 再取4     → [3,4]
 └─取4 → 后面不足 → 剪枝,不递归
```

**剪枝优化**:若"已选 + 剩余可选的数 < k"则没必要继续,即循环起点 `i` 最大到 `n - (k - path.size()) + 1`。

## 复杂度

- 时间:O(C(n,k)) 组合数,每片叶子拷贝一次答案 O(k)
- 空间:O(k) 路径 + O(C(n,k)·k) 输出

## 参考代码

### C++

```cpp
class Solution {
public:
    vector<vector<int>> ans;
    vector<int> path;
    void dfs(int n, int k, int start) {
        if (path.size() == k) { ans.push_back(path); return; }
        for (int i = start; i <= n - (k - path.size()) + 1; i++) {  // 剪枝
            path.push_back(i);
            dfs(n, k, i + 1);          // 下一个数从 i+1 开始
            path.pop_back();           // 回溯
        }
    }
    vector<vector<int>> combine(int n, int k) {
        dfs(n, k, 1);
        return ans;
    }
};
```

### Python

```python
class Solution:
    def combine(self, n: int, k: int) -> List[List[int]]:
        ans, path = [], []
        def dfs(start: int) -> None:
            if len(path) == k:
                ans.append(path[:])
                return
            for i in range(start, n - (k - len(path)) + 2):   # 剪枝
                path.append(i)
                dfs(i + 1)
                path.pop()
        dfs(1)
        return ans
```

## 小结

- 回溯三板斧:**选择 → 递归 → 撤销选择**。
- 组合用 `startIndex`、排列用 `used[]` 数组——这是两类题的核心区别。
- 系列:39 组合总和、40 组合总和 II、216 组合总和 III、78 子集。
