# 长度最小的子数组 LeetCode 209

**难度**：中等 ｜ **分类**：数组 ｜ **标签**：滑动窗口

## 题目描述

给定一个含有 n 个正整数的数组和一个正整数 target。找出该数组中满足其和 `≥ target` 的**长度最小的连续子数组**
`[nums[l], nums[l+1], ..., nums[r-1], nums[r]]`,并返回其长度。如果不存在符合条件的子数组,返回 0。

**示例**
```
输入: target = 7, nums = [2,3,1,2,4,3]
输出: 2
解释: 子数组 [4,3] 是满足条件的最短连续子数组
```

<!-- @题解 -->

## 思路与图解

暴力:枚举每个起点再累加 → O(n²)。滑动窗口把枚举"起点"改成"终点",窗口和满足条件时尽量缩左边:

```
target=7   nums = [2, 3, 1, 2, 4, 3]

① 窗口 [2,3,1,2] 和=8 ≥ 7 → 尝试收缩左边: [3,1,2]=6 < 7 停止,记录 len=4
② 扩右边加 4 → [3,1,2,4] 和=10 ≥ 7 → 收缩: [1,2,4]=7 ≥7 → len=3; 再缩 [2,4]=6<7
③ 扩右边加 3 → [2,4,3] 和=9 ≥ 7 → 收缩: [4,3]=7 ≥7 → len=2 ✓ 最短

动画示意(窗口框住部分):
 [2 3 1 2 4 3]   sum<7 右扩
 [2 3 1 2]4 3     sum=8≥7 记录4 → 左缩
  2[3 1 2]4 3     sum=6<7 右扩
  2[3 1 2 4]3     sum=10 记录3 → 左缩
  2 3[1 2 4]3     sum=7 记录3 → 左缩
  2 3 1[2 4]3     sum=6 右扩
  2 3 1[2 4 3]    sum=9 记录3 → 左缩
  2 3 1 2[4 3]    sum=7 记录2 ✓
```

要点:右指针每次只前进一格,左指针根据窗口和向右收缩,左右都只走一趟 → O(n)。

## 复杂度

- 时间:O(n),每个元素最多进/出窗口各一次
- 空间:O(1)

## 参考代码

### C++

```cpp
class Solution {
public:
    int minSubArrayLen(int target, vector<int>& nums) {
        int n = nums.size(), sum = 0, left = 0, ans = INT_MAX;
        for (int right = 0; right < n; right++) {
            sum += nums[right];
            while (sum >= target) {              // 窗口和满足条件就收缩左边
                ans = min(ans, right - left + 1);
                sum -= nums[left++];
            }
        }
        return ans == INT_MAX ? 0 : ans;
    }
};
```

### Python

```python
class Solution:
    def minSubArrayLen(self, target: int, nums: List[int]) -> int:
        n = len(nums)
        left = s = 0
        ans = float('inf')
        for right, x in enumerate(nums):
            s += x
            while s >= target:
                ans = min(ans, right - left + 1)
                s -= nums[left]
                left += 1
        return 0 if ans == float('inf') else ans
```

## 小结

- **滑动窗口**适用:数组/字符串中求满足某条件的"连续子数组/子串"的最值。
- 模板:`for right: 加入 nums[right]; while(条件不满足/满足): 收缩 left`。
- 补充:本题也可用**前缀和 + 二分** O(n log n) 解。
