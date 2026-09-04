# 逆波兰表达式求值 LeetCode 150

**难度**：中等 ｜ **分类**：栈与队列 ｜ **标签**：栈

## 题目描述

给你一个字符串数组 tokens,表示一个根据**逆波兰表示法**(后缀表达式)表示的算术表达式。请你计算该表达式。返回一个表示表达式值的整数。

**示例**
```
输入: tokens = ["2","1","+","3","*"]
输出: 9
解释: (2 + 1) * 3 = 9
```

<!-- @题解 -->

## 思路与图解

逆波兰式是**后缀表达式**,运算符跟在两个操作数后面,天然适合栈:遇到数字入栈,遇到运算符弹出两个数计算后结果再入栈。

```
tokens: 2  1  +  3  *
栈:   [2] → [2,1] → 遇 + 弹 1,2 得 3 → [3]
      → [3,3] → 遇 * 弹 3,3 得 9 → [9] ✓

图解:
  2 1 +   →   (2+1)=3
  3 3 *   →   (3*3)=9

注意减法/除法顺序:先弹出的是右操作数。
  4 5 -   →  4-5 = -1(先弹 5 是右数,再弹 4 是左数,4-5)
```

## 复杂度

- 时间:O(n)
- 空间:O(n),栈深

## 参考代码

### C++

```cpp
class Solution {
public:
    int evalRPN(vector<string>& tokens) {
        stack<int> st;
        for (const string& t : tokens) {
            if (t == "+" || t == "-" || t == "*" || t == "/") {
                int b = st.top(); st.pop();   // 右操作数
                int a = st.top(); st.pop();   // 左操作数
                if (t == "+") st.push(a + b);
                else if (t == "-") st.push(a - b);
                else if (t == "*") st.push(a * b);
                else st.push(a / b);          // C++ 整数除法向 0 截断
            } else st.push(stoi(t));
        }
        return st.top();
    }
};
```

### Python

```python
class Solution:
    def evalRPN(self, tokens: List[str]) -> int:
        st = []
        for t in tokens:
            if t in "+-*/":
                b = st.pop()      # 右操作数
                a = st.pop()      # 左操作数
                if t == "+": st.append(a + b)
                elif t == "-": st.append(a - b)
                elif t == "*": st.append(a * b)
                else: st.append(int(a / b))   # 向 0 截断
            else:
                st.append(int(t))
        return st[-1]
```

## 小结

- 中缀转后缀(调度场算法)与后缀求值都是栈的应用,计算器类题(224 基本计算器)同理。
- 除法的截断语义要注意:Python `int(a/b)` 向 0 截断,`a//b` 是向下取整,勿混用。
