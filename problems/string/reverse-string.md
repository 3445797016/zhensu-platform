# 反转字符串 LeetCode 344

**难度**：简单 ｜ **分类**：字符串 ｜ **标签**：双指针

## 题目描述

编写一个函数,其作用是将输入的字符串反转过来。输入字符串以字符数组 `s` 的形式给出。
不要给另外的数组分配额外空间,你必须原地修改输入数组。

**示例**
```
输入: s = ["h","e","l","l","o"]
输出: ["o","l","l","e","h"]
```

<!-- @题解 -->

## 思路与图解

左右双指针,从两端向中间交换字符:

```
s = h  e  l  l  o
     L           R     交换 → o e l l h, L++ R--
     o  e  l  l  h
        L     R         交换 → o l l e h, L++ R--
     o  l  l  e  h
           LR           相遇/越过,结束 ✓
```

每交换一对,左右指针各向中间移动一位,直到 `left >= right`。

## 复杂度

- 时间:O(n),n 为字符个数,交换 n/2 次
- 空间:O(1),原地

## 参考代码

### C++

```cpp
class Solution {
public:
    void reverseString(vector<char>& s) {
        int l = 0, r = s.size() - 1;
        while (l < r) {
            swap(s[l], s[r]);
            l++; r--;
        }
    }
};
```

### Python

```python
class Solution:
    def reverseString(self, s: List[str]) -> None:
        l, r = 0, len(s) - 1
        while l < r:
            s[l], s[r] = s[r], s[l]
            l += 1
            r -= 1
```

## 小结

- 字符串/数组"原地反转"首选双指针,一趟完成。
- 系列延伸:541 反转字符串 II(每 2k 个反转前 k 个)、557 反转字符串中的单词 III、151 反转字符串中的单词(先整体反转再逐词反转)。
