# 删除链表的倒数第 N 个结点 LeetCode 19

**难度**：中等 ｜ **分类**：链表 ｜ **标签**：双指针 / 哑节点

## 题目描述

给你一个链表,删除链表的倒数第 n 个结点,并且返回链表的头结点。

**示例**
```
输入: head = [1,2,3,4,5], n = 2
输出: [1,2,3,5]
```

<!-- @题解 -->

## 思路与图解

关键技巧:**哑节点(dummy)** + **快慢双指针**。
快指针先走 n+1 步,然后快慢一起走,当快指针到末尾 NULL 时,慢指针正好停在"待删节点的前一个",执行删除。

```
head:  dummy → 1 → 2 → 3 → 4 → 5 → NULL     n=2 (删除倒数第2个=4)

① fast 先走 n+1=3 步:
  dummy → 1 → 2 → 3 → 4 → 5 → NULL
   slow↑          fast↑
② fast/slow 同步前进,直到 fast==NULL:
  dummy → 1 → 2 → 3 → 4 → 5 → NULL
                  slow↑        fast=NULL(停)
  此时 slow.next 指向 4(待删),执行 slow.next = slow.next.next
③ 结果: dummy → 1 → 2 → 3 → 5 → NULL, 返回 dummy.next
```

为什么快指针走 n+1 步?因为要让 `slow` 最终指向**倒数第 n 个的前一个**,删除才不需要记录前驱。
头节点可能被删(如 n=len),所以用 dummy 统一处理,避免特判。

## 复杂度

- 时间:O(n),一趟
- 空间:O(1)

## 参考代码

### C++

```cpp
class Solution {
public:
    ListNode* removeNthFromEnd(ListNode* head, int n) {
        ListNode dummy(0, head);         // 哑节点
        ListNode *fast = &dummy, *slow = &dummy;
        for (int i = 0; i < n + 1; i++) fast = fast->next;   // fast 先走 n+1
        while (fast) { fast = fast->next; slow = slow->next; }
        slow->next = slow->next->next;   // 删除倒数第 n 个
        return dummy.next;
    }
};
```

### Python

```python
class Solution:
    def removeNthFromEnd(self, head: Optional[ListNode], n: int) -> Optional[ListNode]:
        dummy = ListNode(0, head)
        fast = slow = dummy
        for _ in range(n + 1):
            fast = fast.next
        while fast:
            fast = fast.next
            slow = slow.next
        slow.next = slow.next.next
        return dummy.next
```

## 小结

- 链表题见到"倒数第 k 个""删除头节点可能受影响"时,先想到 **dummy 哑节点 + 双指针**。
- 另一思路:先遍历求长度 L,再走 L-n 步到前驱,需要两趟。
