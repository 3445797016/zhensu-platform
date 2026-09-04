# 每日温度 LeetCode 739

**难度**：中等 ｜ **分类**：单调栈 ｜ **标签**：单调栈

## 题目描述

给定一个整数数组 temperatures,表示每天的温度,返回一个数组 answer,其中 answer[i] 是指对于第 i 天,下一个更高温度出现在几天后。如果气温在这之后都不会升高,请在该位置用 0 来代替。

**示例**
```
输入: temperatures = [73,74,75,71,69,72,76,73]
输出: [1,1,4,2,1,1,0,0]
```

<!-- @题解 -->

## 思路与图解

**单调递减栈(存下标)**:栈内温度从栈底到栈顶递减。遍历时,若当前温度 > 栈顶温度,说明栈顶元素遇到了"下一个更高温",弹出并计算间隔。

```
temperatures: 73 74 75 71 69 72 76 73
栈(存下标,画成温度):

i=0 73入 → [73]
i=1 74 > 73 → 弹出73:answer[0]=1-0=1 → 入74 → [74]
i=2 75 > 74 → 弹出74:answer[1]=1 → [75]
i=3 71 < 75 → [75,71]
i=4 69 < 71 → [75,71,69]
i=5 72 > 69 → 弹69:answer[4]=5-4=1
     72 > 71 → 弹71:answer[3]=5-3=2
     72 < 75 → 入 → [75,72]
i=6 76 > 72 → 弹72:answer[5]=1
     76 > 75 → 弹75:answer[2]=6-2=4 → [76]
i=7 73 < 76 → [76,73]
剩余未弹出者 answer=0 → [1,1,4,2,1,1,0,0] ✓

图解(单调性):
 温度
 76 |                    ┃
 75 |        ┃          ┃
 74 |   ┃    ┃    ┃     ┃
 73 |┃  ┃    ┃    ┃     ┃  ┃
    └──────────────────────→ 天
   栈内温度始终递减,遇到更高的就把前面"更矮"的结算掉
```

**单调栈的价值**:每个元素入栈出栈各一次,O(n);比暴力 O(n²) 快得多。

## 复杂度

- 时间:O(n)
- 空间:O(n),栈

## 参考代码

### C++

```cpp
class Solution {
public:
    vector<int> dailyTemperatures(vector<int>& t) {
        int n = t.size();
        vector<int> ans(n, 0);
        stack<int> st;                     // 单调递减栈,存下标
        for (int i = 0; i < n; i++) {
            while (!st.empty() && t[i] > t[st.top()]) {
                ans[st.top()] = i - st.top();   // 遇到更高温,结算
                st.pop();
            }
            st.push(i);
        }
        return ans;
    }
};
```

### Python

```python
class Solution:
    def dailyTemperatures(self, temperatures: List[int]) -> List[int]:
        n = len(temperatures)
        ans = [0] * n
        st = []                       # 单调递减栈,存下标
        for i, x in enumerate(temperatures):
            while st and x > temperatures[st[-1]]:
                ans[st[-1]] = i - st[-1]
                st.pop()
            st.append(i)
        return ans
```

## 小结

- **单调栈模板:找每个元素"右边第一个更大"→ 单调递减栈;找"右边第一个更小"→ 单调递增栈**。
- 扩展:496 下一个更大元素 I、503 下一个更大元素 II(环形,取 2n 遍历)、42 接雨水。
