# 找出字符串中第一个匹配项的下标 LeetCode 28(KMP)

**难度**：简单 ｜ **分类**：字符串 ｜ **标签**：KMP

## 题目描述

给你两个字符串 `haystack` 和 `needle`,请你在 `haystack` 字符串中找出 `needle` 字符串的第一个匹配项的下标(下标从 0 开始)。
如果 `needle` 不是 `haystack` 的一部分,则返回 -1。

**示例**
```
输入: haystack = "sadbutsad", needle = "sad"
输出: 0
```

<!-- @题解 -->

## 思路与图解

暴力匹配在失配时主串指针回退 → 最坏 O(n·m)。KMP 的核心:**失配时不回退主串**,利用已匹配信息跳到安全位置,主串只前进一趟。

`next[i]` = 模式串 `[0..i]` 子串中,最长**相等前后缀**的长度。

```
以 needle = "aabaaf" 为例:
  i     0  1  2  3  4  5
 needle a  a  b  a  a  f
 next   0  1  0  1  2  0
解释:
 next[1]: "aa" 最长相等前后缀 "a" → 1
 next[4]: "aabaa" 最长相等前后缀 "aa" → 2
 next[5]: "aabaaf" 前缀 a 与后缀 f 不等,无相等前后缀 → 0

匹配过程(主串 aabaabaaf):
 a a b a a b a a f       主串不回溯
 a a b a a f             到 f 失配(j=5),j 跳 next[4]=2
          a a b a a f    继续匹配 → 命中 ✓
```

**图解失配跳转**:
```
主串:  a a b a a b a a f
模式:  a a b a a f
              ↑ 失配
跳转后(j = next[j-1] = 2):
模式:        a a b a a f     ← 前 2 个 "aa" 已确定匹配,不必重试
```
因为 `"aabaa"` 的前缀 `"aa"` 等于后缀 `"aa"`,失配处之前的 `"aa"` 可直接当作新一轮匹配的前缀。

## 复杂度

- 时间:O(n + m),求 next O(m)+ 匹配 O(n),主串指针不回退
- 空间:O(m),next 数组

## 参考代码

### C++

```cpp
class Solution {
public:
    int strStr(string haystack, string needle) {
        int n = haystack.size(), m = needle.size();
        if (m == 0) return 0;
        vector<int> next(m);
        next[0] = 0;
        for (int i = 1, j = 0; i < m; i++) {      // 求 next: j 为已匹配前后缀长
            while (j > 0 && needle[i] != needle[j]) j = next[j - 1];
            if (needle[i] == needle[j]) j++;
            next[i] = j;
        }
        for (int i = 0, j = 0; i < n; i++) {      // 匹配
            while (j > 0 && haystack[i] != needle[j]) j = next[j - 1];
            if (haystack[i] == needle[j]) j++;
            if (j == m) return i - m + 1;
        }
        return -1;
    }
};
```

### Python

```python
class Solution:
    def strStr(self, haystack: str, needle: str) -> int:
        n, m = len(haystack), len(needle)
        if m == 0:
            return 0
        nxt = [0] * m
        j = 0
        for i in range(1, m):               # 求 next
            while j > 0 and needle[i] != needle[j]:
                j = nxt[j - 1]
            if needle[i] == needle[j]:
                j += 1
            nxt[i] = j
        j = 0
        for i in range(n):                  # 匹配
            while j > 0 and haystack[i] != needle[j]:
                j = nxt[j - 1]
            if haystack[i] == needle[j]:
                j += 1
            if j == m:
                return i - m + 1
        return -1
```

## 小结

- KMP 精髄:**next 数组让模式串"自我重复"信息被复用**,失配时跳到最长相等前缀,主串不回退。
- 延伸:459 重复的子字符串 = 用 `next[n-1]` 判断 `n % (n - next[n-1]) == 0`。
