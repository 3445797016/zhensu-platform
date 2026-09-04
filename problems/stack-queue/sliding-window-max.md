# 滑动窗口最大值 LeetCode 239

**难度**：困难 ｜ **分类**：栈与队列 ｜ **标签**：单调队列

## 题目描述

给你一个整数数组 nums,有一个大小为 k 的滑动窗口从数组的最左侧移动到最右侧。你只可以看到在滑动窗口内的 k 个数字。滑动窗口每次只向右移动一位。返回滑动窗口中的最大值。

**示例**
```
输入: nums = [1,3,-1,-3,5,3,6,7], k = 3
输出: [3,3,5,5,6,7]
```

<!-- @题解 -->

## 思路与图解

暴力每个窗口扫一遍是 O(n·k)。用**单调递减队列**:队头始终是当前窗口最大值。
维护规则:
1. 入队时把队尾所有**小于等于**新元素的弹出(它们永远不会成为最大值);
2. 队头若已滑出窗口(下标 < left)则弹出;
3. 窗口成型后,队头即答案。

```
nums = [1, 3, -1, -3, 5, 3, 6, 7], k = 3,队列里存下标,这里画成 [值(下标)]

i=0..2 窗口[1 3 -1] : 1入→[1];3入,3>1弹1→[3];-1入→[3,-1]     最大 3 ✓
i=3    窗口[3 -1 -3]: -3入 → [3,-1,-3]                         最大 3 ✓
i=4    窗口[-1 -3 5]: 队头 3(下标1)已滑出窗口,弹出;5入,弹-3、-1 → [5]   最大 5 ✓
i=5    窗口[-3 5 3] : 3入 → [5,3]                              最大 5 ✓
i=6    窗口[5 3 6]  : 6入,6>3、6>5 依次弹出 → [6]               最大 6 ✓
i=7    窗口[3 6 7]  : 7入,7>6 弹6 → [7]                         最大 7 ✓
结果 [3,3,5,5,6,7]
```

每个元素最多入队出队各一次 → 总 O(n)。

## 复杂度

- 时间:O(n)
- 空间:O(k),队列最多 k 个元素

## 参考代码

### C++

```cpp
class Solution {
public:
    vector<int> maxSlidingWindow(vector<int>& nums, int k) {
        deque<int> q;                     // 单调递减队列,存下标
        vector<int> ans;
        for (int i = 0; i < nums.size(); i++) {
            while (!q.empty() && nums[q.back()] <= nums[i]) q.pop_back();  // 弹小的
            q.push_back(i);
            if (q.front() <= i - k) q.pop_front();                        // 滑出窗口
            if (i >= k - 1) ans.push_back(nums[q.front()]);
        }
        return ans;
    }
};
```

### Python

```python
class Solution:
    def maxSlidingWindow(self, nums: List[int], k: int) -> List[int]:
        from collections import deque
        q = deque()          # 单调递减队列,存下标
        ans = []
        for i, x in enumerate(nums):
            while q and nums[q[-1]] <= x:
                q.pop()
            q.append(i)
            if q[0] <= i - k:
                q.popleft()
            if i >= k - 1:
                ans.append(nums[q[0]])
        return ans
```

## 小结

- "滑动窗口最值"标准解:**双端队列维护单调性**,窗口移动时 O(1) 取最值。
- 单调队列、单调栈本质都是**及时丢弃"永不再优"的候选**,保证数据结构内单调有序。
