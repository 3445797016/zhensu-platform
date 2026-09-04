# 两数之和 LeetCode 1

**难度**：简单 ｜ **分类**：哈希表 ｜ **标签**：哈希

## 题目描述

给定一个整数数组 `nums` 和一个整数目标值 `target`,请你在该数组中找出**和为目标值 target** 的那两个整数,并返回它们的数组下标。

**示例**
```
输入: nums = [2,7,11,15], target = 9
输出: [0,1]
解释: 因为 nums[0] + nums[1] == 9
```

<!-- @题解 -->

## 思路与图解

暴力是 O(n²) 双循环。用哈希表把"查找另一半"变成 O(1):

遍历每个数 `x`,检查 `target - x` 是否已在哈希表中;不在就把 `x → 下标` 存进去。
**边遍历边存**,保证不会和自己配对。

```
nums = [2, 7, 11, 15]   target = 9

i=0 x=2   target-x=7  ?map: 无 → map={2:0}
i=1 x=7   target-x=2  ?map: 有! → 返回 [map[2],1] = [0,1] ✓

查找过程示意:
   x=2 ──┐ 缺 7,先入表
   x=7 ──┼─→ 找 2 → 命中 map[2]=0 → [0,1]
```

时间复杂度从 O(n²) 降为 O(n)。

## 复杂度

- 时间:O(n)
- 空间:O(n),哈希表最多存 n 个键

## 参考代码

### C++

```cpp
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> mp;          // 值 -> 下标
        for (int i = 0; i < nums.size(); i++) {
            int need = target - nums[i];
            if (mp.count(need)) return {mp[need], i};
            mp[nums[i]] = i;
        }
        return {};
    }
};
```

### Python

```python
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        mp = {}                       # 值 -> 下标
        for i, x in enumerate(nums):
            need = target - x
            if need in mp:
                return [mp[need], i]
            mp[x] = i
        return []
```

## 小结

- 哈希表最擅长把"查找"从 O(n) 降到 O(1),是**以空间换时间**的典型。
- 系列延伸:15 三数之和(需排序+双指针)、454 四数相加 II(两两分组哈希)。
- 若题目要求"返回下标"必须用哈希;若只判断是否存在,可先排序再用双指针。
