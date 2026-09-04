# 移除元素 LeetCode 27

**难度**：简单 ｜ **分类**：数组 ｜ **标签**：双指针

## 题目描述

给你一个数组 `nums` 和一个值 `val`,你需要**原地**移除所有数值等于 `val` 的元素,并返回移除后数组的新长度。
不要使用额外的数组空间,元素的顺序可以改变。

**示例**
```
输入: nums = [3,2,2,3], val = 3
输出: 2, nums = [2,2]      (前两个元素为 2)
```

<!-- @题解 -->

## 思路与图解

数组是**连续内存**,"删除"一个元素其实是把后面元素整体前移。暴力做法是双重循环 O(n²)。
更优:用**快慢双指针**,快指针负责探路(找不等于 val 的元素),慢指针负责"写入位置"。

```
nums = [3, 2, 2, 3], val = 3

fast/slow 都从 0 出发,每次 fast 前移:
 step1  fast=0: nums[0]=3 == val → 跳过(slow 不动)
 step2  fast=1: nums[1]=2 != val → nums[slow]=2, slow=1
 step3  fast=2: nums[2]=2 != val → nums[slow]=2, slow=2
 step4  fast=3: nums[3]=3 == val → 跳过

结果: nums 前 2 位 = [2,2], slow=2 即新长度

数组视角:
  [3, 2, 2, 3]
   3 被覆盖 ✗ → [2, 2, 2, 3]   slow 只写到第 2 位,多余的不管
```

本质上:把"要保留的元素"依次搬到前面,天然 O(n) 且原地。

## 复杂度

- 时间:O(n),一趟
- 空间:O(1)

## 参考代码

### C++

```cpp
class Solution {
public:
    int removeElement(vector<int>& nums, int val) {
        int slow = 0;
        for (int fast = 0; fast < nums.size(); fast++) {
            if (nums[fast] != val) nums[slow++] = nums[fast];
        }
        return slow;
    }
};
```

### Python

```python
class Solution:
    def removeElement(self, nums: List[int], val: int) -> int:
        slow = 0
        for fast in range(len(nums)):
            if nums[fast] != val:
                nums[slow] = nums[fast]
                slow += 1
        return slow
```

## 小结

- "原地删除/去重"一类题(27、26、283 移动零等)通用套路:**快慢双指针**。
- 慢指针指向"下一个可写位置",快指针扫描,满足条件的元素搬到 slow 处。
