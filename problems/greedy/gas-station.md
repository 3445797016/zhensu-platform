# 加油站 LeetCode 134

**难度**：中等 ｜ **分类**：贪心 ｜ **标签**：贪心 / 环形

## 题目描述

在一条环路上有 n 个加油站,其中第 i 个加油站有汽油 gas[i] 升。
你有一辆油箱容量无限的汽车,从第 i 个加油站开往第 i+1 个加油站需要消耗汽油 cost[i] 升。
你从其中的一个加油站出发,开始时油箱为空。给定两个整数数组 gas 和 cost,如果你可以按顺序绕环路行驶一周,则返回出发时加油站的编号,否则返回 -1。

**示例**
```
输入: gas = [1,2,3,4,5], cost = [3,4,5,1,2]
输出: 3
```

<!-- @题解 -->

## 思路与图解

**可行性**:总油量 `sum(gas) < sum(cost)` 一定无解;反之一定有解。

**找起点**:从 0 出发模拟,维护当前剩余油量 cur。若在某个点 cur 变负,说明**从 0 到该点之间任何点出发都到不了这里**,直接把这些点排除,起点改为 `i+1` 并清零 cur 重新累计。

```
gas  = [1, 2, 3, 4, 5]      diff = gas - cost = [-2, -2, -2, 3, 3]
cost = [3, 4, 5, 1, 2]

从0出发: cur=-2 → 负,起点改为1
从1出发: cur=-2 → 负,起点改为2
从2出发: cur=-2 → 负,起点改为3
从3出发: cur=+3 → 正,继续
         +3+3=6 → 绕一圈回到3,总剩余=sum(diff)=0 ≥0 → 起点3 ✓

图解(cur 变化):
  cur:  0 →-2 →0 →-2 →0 →-2 →0 →3 →6
        ^起点0  ^起点1  ^起点2  ^起点3 剩余油量一直为正
```

为什么负了就整段放弃?因为从这段内任一点出发,到"变负点"前的累计只会更差(前段净消耗>0),不可能更优——贪心的"剪枝"依据。

## 复杂度

- 时间:O(n),一趟
- 空间:O(1)

## 参考代码

### C++

```cpp
class Solution {
public:
    int canCompleteCircuit(vector<int>& gas, vector<int>& cost) {
        int n = gas.size();
        int total = 0, cur = 0, start = 0;
        for (int i = 0; i < n; i++) {
            total += gas[i] - cost[i];      // 全程净油量
            cur += gas[i] - cost[i];
            if (cur < 0) {                  // 当前起点到 i 之间都不可行
                start = i + 1;
                cur = 0;
            }
        }
        return total < 0 ? -1 : start;
    }
};
```

### Python

```python
class Solution:
    def canCompleteCircuit(self, gas: List[int], cost: List[int]) -> int:
        n = len(gas)
        total = cur = start = 0
        for i in range(n):
            total += gas[i] - cost[i]
            cur += gas[i] - cost[i]
            if cur < 0:
                start = i + 1
                cur = 0
        return -1 if total < 0 else start
```

## 小结

- 环形贪心套路:**总油量兜底 + 前缀油量找起点**。
- "前缀和一旦为负就整体跳过、从下一段重开"的思路,在 53 最大子数组和等题中同样出现。
