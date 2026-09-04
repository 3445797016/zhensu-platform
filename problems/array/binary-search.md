# 二分查找 LeetCode 704

**难度**：简单 ｜ **分类**：数组 ｜ **标签**：二分查找

## 题目描述

给定一个 n 个元素有序的(升序)整型数组 `nums` 和一个目标值 `target`,写一个函数搜索 `nums` 中的 `target`,
如果目标值存在返回下标,否则返回 -1。

**示例 1**
```
输入: nums = [-1,0,3,5,9,12], target = 9
输出: 4        (9 出现在 nums 中且下标为 4)
```

**示例 2**
```
输入: nums = [-1,0,3,5,9,12], target = 2
输出: -1       (2 不存在 nums 中,返回 -1)
```

<!-- @题解 -->

## 思路与图解

二分查找的核心是**区间不变量**:每次把搜索区间折半,并保持"区间定义"前后一致。
这里采用**左闭右闭 `[left, right]`**:`left == right` 时区间内还有一个元素,必须继续判断,所以 `while (left <= right)`。

```
nums:  [-1   0   3   5   9   12]     target = 9
         ↑                    ↑
        left                 right        mid = (0+5)/2 = 2 → nums[2]=3 < 9

       [-1   0   3   5   9   12]        右半区间继续 [3,5]
                 ↑       ↑
                left    right           mid = (3+5)/2 = 4 → nums[4]=9 == 9 ✓ 返回 4

若 target=2:
       ... nums[4]=9 > 2 → left=3, right=3 → mid=3 → nums[3]=5 > 2
       → right=2, 此时 left(3) > right(2) 循环结束 → 返回 -1
```

- `nums[mid] == target` → 命中返回
- `nums[mid] >  target` → 目标在左半边 → `right = mid - 1`
- `nums[mid] <  target` → 目标在右半边 → `left  = mid + 1`

每次区间缩小一半,所以是 **O(log n)**。

## 复杂度

- 时间:O(log n)
- 空间:O(1)

## 参考代码

### C++

```cpp
class Solution {
public:
    int search(vector<int>& nums, int target) {
        int left = 0, right = nums.size() - 1;          // 左闭右闭
        while (left <= right) {
            int mid = left + (right - left) / 2;        // 防溢出写法
            if (nums[mid] == target) return mid;
            else if (nums[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }
};
```

### Python

```python
class Solution:
    def search(self, nums: List[int], target: int) -> int:
        left, right = 0, len(nums) - 1        # 左闭右闭
        while left <= right:
            mid = left + (right - left) // 2
            if nums[mid] == target:
                return mid
            elif nums[mid] < target:
                left = mid + 1
            else:
                right = mid - 1
        return -1
```

## 小结

- 二分的前提是**有序**;写题时先明确自己的区间是"左闭右闭"还是"左闭右开",全程保持一致。
- `mid = left + (right - left) / 2` 避免 `left + right` 溢出。
