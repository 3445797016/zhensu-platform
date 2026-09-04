# 三数之和 LeetCode 15

**难度**：中等 ｜ **分类**：哈希表 ｜ **标签**：排序 + 双指针

## 题目描述

给你一个整数数组 `nums`,判断是否存在三元组 `[nums[i], nums[j], nums[k]]` 满足 `i != j、i != k 且 j != k`,同时还满足 `nums[i] + nums[j] + nums[k] == 0`。请你返回所有**和为 0 且不重复**的三元组。

**示例**
```
输入: nums = [-1,0,1,2,-1,-4]
输出: [[-1,-1,2],[-1,0,1]]
```

<!-- @题解 -->

## 思路与图解

**先排序**,固定一个数 `nums[i]`,剩下的用**双指针**在 `[i+1, end]` 区间找两数和 = `-nums[i]`。
双指针让内层从 O(n²) 变 O(n),整体 O(n²)。关键:去重。

```
排序后: [-4, -1, -1, 0, 1, 2]       target(两数和) = 0 - nums[i]

i=0: nums[0]=-4 → 找两数和=4:
  [-4, -1, -1, 0, 1, 2]
    ↑i  L↑           ↑R
  L=-1 R=2 和=1 <4 → L右移  (数太小,左指针右移让和变大)
  L=-1 R=2 和=1 <4 → L右移 → L=0 R=2 和=2<4 → L=1? 跳过重复...
  L=1  R=2  和=3 <4 → L右移越界 → 无解,i++

i=1: nums[1]=-1 → 找两数和=1:
  [-4, -1, -1, 0, 1, 2]
       ↑i  L↑     ↑R    L=-1 R=2 和=1 ✓ → [-1,-1,2]
       再去重/收缩 → L=0 R=1 和=1 ✓ → [-1,0,1] (i=1 这轮实际是 -1)
i=2: nums[2]=-1 与 i=1 相同 → 跳过(去重)
```

**去重三连**:
- `i` 层:若 `nums[i]==nums[i-1]` 跳过;
- 命中后:`L` 跳过与当前相同的值、`R` 同理,防止三元组重复。

## 复杂度

- 时间:O(n²),排序 O(n log n)
- 空间:O(1)(不计输出),排序可能 O(log n)

## 参考代码

### C++

```cpp
class Solution {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        sort(nums.begin(), nums.end());
        vector<vector<int>> ans;
        int n = nums.size();
        for (int i = 0; i < n - 2; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;  // 去重
            int L = i + 1, R = n - 1;
            while (L < R) {
                int s = nums[i] + nums[L] + nums[R];
                if (s == 0) {
                    ans.push_back({nums[i], nums[L], nums[R]});
                    while (L < R && nums[L] == nums[L + 1]) L++;   // 去重
                    while (L < R && nums[R] == nums[R - 1]) R--;
                    L++; R--;
                } else if (s < 0) L++;
                else R--;
            }
        }
        return ans;
    }
};
```

### Python

```python
class Solution:
    def threeSum(self, nums: List[int]) -> List[List[int]]:
        nums.sort()
        ans, n = [], len(nums)
        for i in range(n - 2):
            if i > 0 and nums[i] == nums[i - 1]:
                continue
            L, R = i + 1, n - 1
            while L < R:
                s = nums[i] + nums[L] + nums[R]
                if s == 0:
                    ans.append([nums[i], nums[L], nums[R]])
                    while L < R and nums[L] == nums[L + 1]: L += 1
                    while L < R and nums[R] == nums[R - 1]: R -= 1
                    L += 1; R -= 1
                elif s < 0:
                    L += 1
                else:
                    R -= 1
        return ans
```

## 小结

- "两数之和"要下标用哈希;"三数/四数之和"要**去重**,用**排序 + 双指针**更合适。
- 双指针能工作的前提是数组有序,通过判断和的大小决定移动哪一侧指针。
