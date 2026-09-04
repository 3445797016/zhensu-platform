# 反转链表 LeetCode 206

**难度**：简单 ｜ **分类**：链表 ｜ **标签**：迭代 / 递归

## 题目描述

给你单链表的头节点 `head`,请你反转链表,并返回反转后的链表。

**示例**
```
输入: 1 → 2 → 3 → 4 → 5 → NULL
输出: 5 → 4 → 3 → 2 → 1 → NULL
```

<!-- @题解 -->

## 思路与图解

迭代法:维护 `prev / cur / next` 三个指针,把每个节点的 `next` 掉头指向前一个节点:

```
初始:  NULL  1 → 2 → 3 → NULL
        prev cur

step1  保存 next=2, 令 cur.next=prev(NULL)
       NULL ← 1   2 → 3 → NULL      prev=1, cur=2
step2  保存 next=3, 令 cur.next=prev(1)
       NULL ← 1 ← 2   3 → NULL      prev=2, cur=3
step3  保存 next=NULL, cur.next=prev(2)
       NULL ← 1 ← 2 ← 3             prev=3, cur=NULL

结束时 prev 指向新头 3 ✓
```

画成指针变化:
```
NULL←①  ②→③→NULL     处理②: ②.next 指向①
NULL←①←②  ③→NULL     处理③: ③.next 指向②
NULL←①←②←③           完成,返回③
```

## 复杂度

- 时间:O(n),一趟
- 空间:O(1)(递归法为 O(n) 栈深)

## 参考代码

### C++

```cpp
class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode *prev = nullptr, *cur = head;
        while (cur) {
            ListNode* next = cur->next;
            cur->next = prev;
            prev = cur;
            cur = next;
        }
        return prev;
    }
};
```

### Python

```python
class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev, cur = None, head
        while cur:
            nxt = cur.next
            cur.next = prev
            prev, cur = cur, nxt
        return prev
```

## 小结

- 链表题先画图再写码,特别注意**保存后继节点**,防止指针丢失。
- 递归版:`reverseList(head)` = 先反转后面的链,再把 `head.next.next = head`、`head.next = None`。
