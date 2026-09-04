# 螺旋矩阵 II LeetCode 59

**难度**：中等 ｜ **分类**：数组 ｜ **标签**：模拟 / 边界

## 题目描述

给你一个正整数 n,生成一个包含 1 到 n² 所有元素,且元素按**顺时针螺旋顺序**排列的 n×n 正方形矩阵。

**示例**
```
输入: n = 3
输出:
 [1, 2, 3],
 [8, 9, 4],
 [7, 6, 5]
```

<!-- @题解 -->

## 思路与图解

按"上边 → 右边 → 下边 → 左边"一圈圈填数。关键是坚持**循环不变量**:每条边都采用**左闭右开**区间,
即每条边只填 n-1 个格子,最后一个格子交给下一条边,这样每条边长度一致,不容易乱。

```
n=3, 填数顺序(数字=填入顺序):
第一圈(offset=1, 边长 n-1=2):
  → 上: (0,0)(0,1)    填 1,2
  ↓ 右: (1,2)         填 3      ← 右列从上到下,首格已由"上"填到(0,2)了吗?
  ...
```

画清楚(数字为 1..9 的填法,箭头表示每条边走的格子):

```
 1 → 2 → 3
         ↓
 8 → 9   4
 ↑       ↓
 7 ← 6 ← 5
```

四条边都走 `n-1` 格:
上 `(0,0)->(0,1)`、右 `(0,2)->(1,2)`、下 `(2,2)->(2,1)`、左 `(2,0)->(1,0)`,
最后中间剩一个 `(1,1)` 填 9。每圈结束把上下左右边界各收缩 1。

## 复杂度

- 时间:O(n²),每个格子填一次
- 空间:O(n²) 输出矩阵本身;若不记输出为 O(1)

## 参考代码

### C++

```cpp
class Solution {
public:
    vector<vector<int>> generateMatrix(int n) {
        vector<vector<int>> m(n, vector<int>(n));
        int top = 0, bottom = n - 1, left = 0, right = n - 1, num = 1;
        while (num <= n * n) {
            for (int j = left; j <= right; j++) m[top][j] = num++;   // →
            top++;
            for (int i = top; i <= bottom; i++) m[i][right] = num++; // ↓
            right--;
            for (int j = right; j >= left; j--) m[bottom][j] = num++;// ←
            bottom--;
            for (int i = bottom; i >= top; i--) m[i][left] = num++;  // ↑
            left++;
        }
        return m;
    }
};
```

### Python

```python
class Solution:
    def generateMatrix(self, n: int) -> List[List[int]]:
        m = [[0] * n for _ in range(n)]
        top, bottom, left, right = 0, n - 1, 0, n - 1
        num = 1
        while num <= n * n:
            for j in range(left, right + 1):        # →
                m[top][j] = num; num += 1
            top += 1
            for i in range(top, bottom + 1):        # ↓
                m[i][right] = num; num += 1
            right -= 1
            for j in range(right, left - 1, -1):    # ←
                m[bottom][j] = num; num += 1
            bottom -= 1
            for i in range(bottom, top - 1, -1):    # ↑
                m[i][left] = num; num += 1
            left += 1
        return m
```

## 小结

- 矩阵遍历类(螺旋、旋转、对角线)的核心是**边界管理**,推荐维护 `top/bottom/left/right` 四边界。
- 用 while 循环不断收缩,直到越界,天然避免"奇偶中心"特判。
