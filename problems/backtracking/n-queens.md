# N 皇后 LeetCode 51

**难度**：困难 ｜ **分类**：回溯 ｜ **标签**：回溯 / 棋盘

## 题目描述

按照国际象棋的规则,皇后可以攻击与之处在同一行或同一列或同一斜线上的棋子。
n 皇后问题研究的是如何将 n 个皇后放置在 n×n 的棋盘上,并且使皇后彼此之间不能相互攻击。给你一个整数 n,返回所有不同的 n 皇后问题的解决方案。

**示例**
```
输入: n = 4
输出: [[".Q..","...Q","Q...","..Q."],
      ["..Q.","Q...","...Q",".Q.."]]
```

<!-- @题解 -->

## 思路与图解

**按行放皇后**:一行只放一个,递归处理行号 row;每行尝试所有列 col,若与已放置的皇后不冲突则放下并递归下一行。

冲突检查(只需检查当前列与两条对角线):
```
棋盘 4×4,放第 2 行(col=1)时检查是否与前面行冲突:

  . Q . .        ← row0 皇后在 col1
  冲突?列:前面有没有 col=1 的?
  . . . 反斜线 \: 行差 == 列差 即同一条 \ 对角线
  / 斜线 /: 行差 == -(列差)

更简单的记录法(以 n=4 为例,放 Q 于 (r,c)):
  列冲突:    cols[c] 已被占
  对角线 \:  r - c  相同 → 用数组 d1
  对角线 /:  r + c  相同 → 用数组 d2

回溯树(n=4,每行展开可行列,✗为被攻击):
  row0: Q...  .Q..  ..Q.  ...Q
  row1: 由 row0 每种情况各展开…… 合法才继续
```

递归深度 n、每层尝试 n 列 → O(n!)(第一层 n、第二层 n-1…)。

## 复杂度

- 时间:O(n!),实际有剪枝远小于 n!
- 空间:O(n),递归栈 + 三个标记数组

## 参考代码

### C++

```cpp
class Solution {
public:
    vector<vector<string>> ans;
    vector<string> board;
    vector<bool> col, d1, d2;      // 列、\ 对角线(r-c)、/ 对角线(r+c)
    void dfs(int row, int n) {
        if (row == n) { ans.push_back(board); return; }
        for (int c = 0; c < n; c++) {
            int a = row - c + n, b = row + c;      // +n 偏移避免负下标
            if (col[c] || d1[a] || d2[b]) continue;
            col[c] = d1[a] = d2[b] = true;
            board[row][c] = 'Q';
            dfs(row + 1, n);
            board[row][c] = '.';
            col[c] = d1[a] = d2[b] = false;
        }
    }
    vector<vector<string>> solveNQueens(int n) {
        board.assign(n, string(n, '.'));
        col.assign(n, false); d1.assign(2 * n, false); d2.assign(2 * n, false);
        dfs(0, n);
        return ans;
    }
};
```

### Python

```python
class Solution:
    def solveNQueens(self, n: int) -> List[List[str]]:
        ans, board = [], [['.'] * n for _ in range(n)]
        col, d1, d2 = set(), set(), set()      # 列、r-c、r+c
        def dfs(r: int) -> None:
            if r == n:
                ans.append([''.join(row) for row in board])
                return
            for c in range(n):
                if c in col or (r - c) in d1 or (r + c) in d2:
                    continue
                col.add(c); d1.add(r - c); d2.add(r + c)
                board[r][c] = 'Q'
                dfs(r + 1)
                board[r][c] = '.'
                col.discard(c); d1.discard(r - c); d2.discard(r + c)
        dfs(0)
        return ans
```

## 小结

- 棋盘类回溯:**按行放置 + 三个集合判重(列、主对角、副对角)**。
- 主对角 `r-c` 恒定、副对角 `r+c` 恒定,用集合/布尔数组 O(1) 判冲突。
- 只求方案数时是 52 题,改递归返回计数即可。
