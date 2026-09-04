# 零钱兑换 LeetCode 322(完全背包)

**难度**：中等 ｜ **分类**：动态规划 ｜ **标签**：完全背包 / BFS

## 题目描述

给你一个整数数组 coins,表示不同面额的硬币;以及一个整数 amount,表示总金额。
计算并返回可以凑成总金额所需的**最少的硬币个数**。如果没有任何一种硬币组合能组成总金额,返回 -1。你可以认为每种硬币的数量是无限的。

**示例**
```
输入: coins = [1, 2, 5], amount = 11
输出: 3        (11 = 5 + 5 + 1)
```

<!-- @题解 -->

## 思路与图解

每种硬币**无限用** → **完全背包**,容量循环**正序**(允许同一物品重复取)。
`dp[j]` = 凑出金额 j 的最少硬币数,`dp[j] = min(dp[j], dp[j - coin] + 1)`。
初始 `dp[0]=0`,其余为无穷大。

```
coins = [1, 2, 5], amount = 11
dp:   j   0  1  2  3  4  5  6  7  8  9 10 11
初始      0  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞
处理1:   0  1  2  3  4  5  6  7  8  9 10 11
处理2:   0  1  1  2  2  3  3  4  4  5  5  6    ← 正序:2 元可反复用
处理5:   0  1  1  2  2  1  2  2  3  3  2  3 ✓  ← dp[11]=3

dp[11] 的组成(背包视角):
  5 元 → dp[6] = 2(5+1) → 再 +5 = 11,共 3 枚
```

完全背包与 0-1 背包的唯一区别:**容量循环方向**(正序=可重复取,倒序=每件至多一次)。

## 复杂度

- 时间:O(n·amount)
- 空间:O(amount)

## 参考代码

### C++

```cpp
class Solution {
public:
    int coinChange(vector<int>& coins, int amount) {
        vector<int> dp(amount + 1, INT_MAX / 2);
        dp[0] = 0;
        for (int c : coins) {
            for (int j = c; j <= amount; j++) {   // 完全背包:正序
                dp[j] = min(dp[j], dp[j - c] + 1);
            }
        }
        return dp[amount] == INT_MAX / 2 ? -1 : dp[amount];
    }
};
```

### Python

```python
class Solution:
    def coinChange(self, coins: List[int], amount: int) -> int:
        dp = [float('inf')] * (amount + 1)
        dp[0] = 0
        for c in coins:
            for j in range(c, amount + 1):        # 完全背包:正序
                dp[j] = min(dp[j], dp[j - c] + 1)
        return dp[amount] if dp[amount] != float('inf') else -1
```

## 小结

- **完全背包 vs 0-1 背包**:正序容量循环 = 可重复取;倒序 = 每件一次。
- 求组合数用 518 零钱兑换 II(`dp[j] += dp[j-c]`),注意"组合"与"排列"的循环顺序差异。
- 也可用 BFS 最短路(硬币为边权)求解最少个数。
