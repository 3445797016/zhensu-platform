# 全排列 LeetCode 46

**难度**：中等 ｜ **分类**：回溯 ｜ **标签**：回溯 / used 数组

## 题目描述

给定一个不含重复数字的数组 nums,返回其所有可能的全排列。你可以按任意顺序返回答案。

**示例**
```
输入: nums = [1,2,3]
输出: [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]
```

<!-- @题解 -->

## 思路与图解

排列是**有序**的,`[1,2]` 与 `[2,1]` 都算,所以每层都要从头选,靠 `used[]` 标记"已用过的元素"避免重复选自己:

```
                [ ]
        选1      选2     选3
       /   \    /  \    /  \
     [1]选2 [1]选3 ...
     used={1}

搜索树(nums=[1,2,3], used 标记已用):
    根
  1      2      3        ← 第一层三个分支
 / \    / \    / \
2   3  1   3  1   2      ← 第二层(不能再用第一层选过的)
|   |  |   |  |   |
3   2  3   1  2   1
[123][132][213][231][312][321] 共 3!=6 个叶子 ✓
```

与"组合"对比:**组合用 start 递增(不回头),排列每层从 0 开始但要跳过 used 的元素**。

## 复杂度

- 时间:O(n·n!),n! 个排列,每个拷贝 O(n)
- 空间:O(n)(used + path 递归栈)

## 参考代码

### C++

```cpp
class Solution {
public:
    vector<vector<int>> ans;
    vector<int> path;
    void dfs(vector<int>& nums, vector<bool>& used) {
        if (path.size() == nums.size()) { ans.push_back(path); return; }
        for (int i = 0; i < nums.size(); i++) {
            if (used[i]) continue;          // 已用过
            used[i] = true;
            path.push_back(nums[i]);
            dfs(nums, used);
            path.pop_back();
            used[i] = false;                // 回溯
        }
    }
    vector<vector<int>> permute(vector<int>& nums) {
        vector<bool> used(nums.size());
        dfs(nums, used);
        return ans;
    }
};
```

### Python

```python
class Solution:
    def permute(self, nums: List[int]) -> List[List[int]]:
        ans, path = [], []
        used = [False] * len(nums)
        def dfs():
            if len(path) == len(nums):
                ans.append(path[:])
                return
            for i in range(len(nums)):
                if used[i]:
                    continue
                used[i] = True
                path.append(nums[i])
                dfs()
                path.pop()
                used[i] = False
        dfs()
        return ans
```

## 小结

- **used 数组**标记本轮搜索中"已占用"的元素,是排列类题的核心。
- 47 全排列 II 有重复元素:同一层相同的数只取第一次,需 `if (i>0 && nums[i]==nums[i-1] && !used[i-1]) continue`。
