# 接雨水 LeetCode 42

**难度**：困难 ｜ **分类**：单调栈 ｜ **标签**：单调栈 / 双指针

## 题目描述

给定 n 个非负整数表示每个宽度为 1 的柱子的高度图,计算按此排列的柱子,下雨之后能接多少雨水。

**示例**
```
输入: height = [0,1,0,2,1,0,1,3,2,1,2,1]
输出: 6
```

<!-- @题解 -->

## 思路与图解

能接水的地方一定是"低洼":左右都有比自己高的柱子。逐列看,某列能接的水 = `min(左最高, 右最高) - height[i]`(非负)。据此有几种等价的实现:

**方法一:单调栈(按"横向"累计)**。维护单调**递减**栈(存下标),遇到比栈顶高的柱子,就弹出栈顶作为"坑底",此时左右边界分别是新的栈顶与当前柱子,水层高度 = 两边较矮的 - 坑底高,宽度 = 两边界距离。

```
height: 0 1 0 2 1 0 1 3 2 1 2 1
雨水(用~表示):
                ~
        ~ ~ ~ ~ ~
    ~ ~ ~ ~ ~ ~ ~ ~
  ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
 0 1 0 2 1 0 1 3 2 1 2 1
   ^         ^ ^
   ├─ 每段洼地由"左右两根较高的柱子"夹出 ─┤

单调栈处理一处洼地(弹出坑底 mid):
  左边界 L = 栈顶(比 mid 高),右边界 R = 当前 i
  水层高 h = min(height[L], height[R]) - height[mid]
  宽度   w = R - L - 1
  累计 += h * w
```

**方法二:双指针(按"纵向"累计)**。左右指针 + 维护 `lmax/rmax`;哪边矮就结算哪边:接水量 = min(lmax, rmax) - height[i]。
方法三:预处理左右最大值数组,逐列相加。三者 O(n)。

## 复杂度

- 时间:O(n)
- 空间:O(n)(单调栈)或 O(1)(双指针)

## 参考代码

### C++(单调栈)

```cpp
class Solution {
public:
    int trap(vector<int>& h) {
        int ans = 0, n = h.size();
        stack<int> st;                    // 递减栈
        for (int i = 0; i < n; i++) {
            while (!st.empty() && h[i] > h[st.top()]) {
                int mid = st.top(); st.pop();          // 坑底
                if (st.empty()) break;                 // 左边没有更高的柱子
                int L = st.top(), w = i - L - 1;
                int hh = min(h[L], h[i]) - h[mid];     // 水层高
                if (hh > 0) ans += hh * w;
            }
            st.push(i);
        }
        return ans;
    }
};
```

### Python(双指针,空间 O(1))

```python
class Solution:
    def trap(self, height: List[int]) -> int:
        l, r = 0, len(height) - 1
        lmax = rmax = 0
        ans = 0
        while l < r:
            lmax = max(lmax, height[l])
            rmax = max(rmax, height[r])
            if lmax < rmax:              # 结算较低的一侧
                ans += lmax - height[l]
                l += 1
            else:
                ans += rmax - height[r]
                r -= 1
        return ans
```

## 小结

- 接雨水是"单调栈/双指针/前后缀"三解的经典题,务必掌握**双指针 O(1) 空间**版本。
- 核心公式:`贡献 = min(左侧最高, 右侧最高) - 自身高度`,所有解法都是它的不同落地方式。
- 类似:84 柱状图中最大的矩形(反过来求最大面积,单调递增栈)。
