# 最长递增子序列 LeetCode 300(LIS)

**难度**：中等 ｜ **分类**：动态规划 ｜ **标签**：LIS / 二分

## 题目描述

给你一个整数数组 nums,找到其中最长严格递增子序列的长度。
子序列是由数组派生而来的序列,删除(或不删除)数组中的元素而不改变其余元素的顺序。

**示例**
```
输入: nums = [10,9,2,5,3,7,101,18]
输出: 4        (最长递增子序列是 [2,3,7,101])
```

<!-- @题解 -->

## 思路与图解

**方法一:DP(O(n²))**。`dp[i]` = 以 nums[i] 结尾的最长递增子序列长度。
对每个 i,遍历前面所有 j:`若 nums[j] < nums[i] → dp[i] = max(dp[i], dp[j]+1)`。

```
nums = [10, 9, 2, 5, 3, 7, 101, 18]
dp   = [ 1, 1, 1, 2, 2, 3,  4,  4]
以 7 结尾:前面比 7 小的有 2,5,3 → 最长的是以 5 结尾的 [2,5] 长2
          → dp = 2+1 = 3 → 子序列 [2,5,7]
```

**方法二:贪心 + 二分(O(n log n))**。维护一个 `tails` 数组:长度 i+1 的递增子序列的**最小末尾值**。
对每个 x:
- 比 tails 末尾大 → 追加;
- 否则二分找到第一个 `>= x` 的位置替换掉(让"潜力"更大)。

```
nums: 10  9  2  5  3  7  101  18
tails: [10]
        [9]        ← 9 < 10,替换
        [2]        ← 2 < 9,替换
        [2,5]      ← 5 > 2,追加
        [2,3]      ← 3 替换 5(同样长度,末尾更小更优)
        [2,3,7]
        [2,3,7,101]
        [2,3,7,18] ← 18 替换 101
长度 = 4 ✓    (注意 tails 不是真实子序列,但长度正确)
```

## 复杂度

- 方法一:O(n²) / O(n)
- 方法二:O(n log n) / O(n)

## 参考代码

### C++

```cpp
class Solution {
public:
    int lengthOfLIS(vector<int>& nums) {
        vector<int> tails;                     // 贪心 + 二分
        for (int x : nums) {
            auto it = lower_bound(tails.begin(), tails.end(), x);
            if (it == tails.end()) tails.push_back(x);
            else *it = x;
        }
        return tails.size();
    }
};
```

### Python

```python
class Solution:
    def lengthOfLIS(self, nums: List[int]) -> int:
        import bisect
        tails = []
        for x in nums:
            i = bisect.bisect_left(tails, x)
            if i == len(tails):
                tails.append(x)
            else:
                tails[i] = x
        return len(tails)
```

## 小结

- `tails` 中替换而非追加,体现贪心思想:**同样长度,末尾越小,未来越可能变长**。
- 延伸:673 最长递增子序列个数(需同时记录计数)、354 俄罗斯套娃信封(排序 + LIS)。
- "最长公共子序列"等同类题可搜索"LIS / LCS"专题。
