# 分割等和子集 LeetCode 416(0-1 背包)

**难度**：中等 ｜ **分类**：动态规划 ｜ **标签**：0-1 背包

## 题目描述

给你一个只包含正整数的非空数组 nums。请你判断是否可以将这个数组分割成两个子集,使得两个子集的元素和相等。

**示例**
```
输入: nums = [1,5,11,5]
输出: true      (分割成 [1,5,5] 和 [11])
```

<!-- @题解 -->

## 思路与图解

转化为 0-1 背包:总和为 sum,**能否选出若干个数恰好凑成 sum/2**(每个数只能用一次)。
若 sum 为奇数直接 false。目标容量 `C = sum/2`,`dp[j]` = 能否用前 i 个物品凑出容量 j。

```
nums = [1, 5, 11, 5], sum = 22, C = 11
dp 数组(容量 0..11),物品按序处理:

初始: dp = [T, F, F, ...]        (容量0恒可达)
放入 1 : [T, T, F, F, ...]
放入 5 : 从大到小更新(0-1背包必须倒序!)
放入 11: ...
放入 5 : dp[11] = T ✓

倒序遍历原因(图解):
 正序会把同一个物品用两次:
   容量 j: 0 1 2 ... j ...
   dp[j] = dp[j] || dp[j - w]   ← 若正序,dp[j-w]可能已被本物品更新,
                                   相当于"重复取本物品"(变完全背包)
  倒序则 dp[j-w] 还是上一轮的状态,保证每个物品最多用一次
```

0-1 背包通用二维递推(一维压缩后):`for j 从 C 到 w:` `dp[j] = dp[j] || dp[j-w]`。

## 复杂度

- 时间:O(n·C),C = sum/2
- 空间:O(C)

## 参考代码

### C++

```cpp
class Solution {
public:
    bool canPartition(vector<int>& nums) {
        int sum = accumulate(nums.begin(), nums.end(), 0);
        if (sum % 2) return false;
        int C = sum / 2;
        vector<bool> dp(C + 1, false);
        dp[0] = true;
        for (int x : nums) {
            for (int j = C; j >= x; j--) {   // 0-1 背包:倒序
                dp[j] = dp[j] || dp[j - x];
            }
        }
        return dp[C];
    }
};
```

### Python

```python
class Solution:
    def canPartition(self, nums: List[int]) -> bool:
        total = sum(nums)
        if total % 2:
            return False
        C = total // 2
        dp = [False] * (C + 1)
        dp[0] = True
        for x in nums:
            for j in range(C, x - 1, -1):    # 0-1 背包:倒序
                dp[j] = dp[j] or dp[j - x]
        return dp[C]
```

## 小结

- **0-1 背包特征:每个物品选/不选、且只能用一次 → 容量循环倒序**。
- 同型题:1049 最后一块石头的重量 II、494 目标和(计方案数)。
- 需要"恰好装满且价值最大"时,初始化 `dp[0]=0`、其余 `-inf`,再判断可达性。
