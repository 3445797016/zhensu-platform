# 四数相加 II LeetCode 454

**难度**：中等 ｜ **分类**：哈希表 ｜ **标签**：分组哈希

## 题目描述

给你四个整数数组 `nums1、nums2、nums3、nums4`,数组长度都是 n,请你计算有多少个元组 `(i, j, k, l)` 能满足:
`nums1[i] + nums2[j] + nums3[k] + nums4[l] == 0`。

**示例**
```
输入: nums1=[1,2]  nums2=[-2,-1]  nums3=[-1,2]  nums4=[0,2]
输出: 2
解释: (0,0,0,1) → 1+(-2)+(-1)+2=0
      (1,1,0,0) → 2+(-1)+(-1)+0=0
```

<!-- @题解 -->

## 思路与图解

四个数组两两分组:**先用哈希统计 `nums1+nums2` 每种和出现的次数**,再遍历 `nums3+nums4`,
每组的相反数若在哈希表中,累加其次数。

```
nums1 + nums2 的所有和及次数:
  1+(-2)=-1:1   1+(-1)=0:1   2+(-2)=0:2   2+(-1)=1:1
  → map: {-1:1, 0:3, 1:1}

再枚举 nums3+nums4:
  (-1)+0=-1 → 需要 +1 → map[1]=1 → 累加1
  (-1)+2= 1 → 需要 -1 → map[-1]=1 → 累加1
  2+0=2     → 需要 -2 → map 无 → 0
  2+2=4     → 需要 -4 → map 无 → 0
合计 = 2 ✓

若暴力四层循环:O(n⁴);两两分组后:O(n²) 时间 + O(n²) 空间。
```

相比"三数之和"要求去重,本题要的是**个数**,哈希表统计次数天然合适,无需排序。

## 复杂度

- 时间:O(n²)
- 空间:O(n²),最多存 n² 种和

## 参考代码

### C++

```cpp
class Solution {
public:
    int fourSumCount(vector<int>& a, vector<int>& b, vector<int>& c, vector<int>& d) {
        unordered_map<int, int> mp;
        for (int x : a)
            for (int y : b) mp[x + y]++;          // 统计两数之和
        int ans = 0;
        for (int x : c)
            for (int y : d) ans += mp[-(x + y)];  // 找相反数
        return ans;
    }
};
```

### Python

```python
class Solution:
    def fourSumCount(self, nums1: List[int], nums2: List[int], nums3: List[int], nums4: List[int]) -> int:
        from collections import Counter
        mp = Counter(x + y for x in nums1 for y in nums2)
        return sum(mp[-(x + y)] for x in nums3 for y in nums4)
```

## 小结

- 多数组求和类问题先想**分组**:2+2 分组把 O(n⁴) 降到 O(n²)。
- 对比:454 求个数(哈希计数)、15/18 求不重复组合(排序+双指针)、1 求下标(哈希)。
