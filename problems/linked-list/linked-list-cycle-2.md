# 环形链表 II LeetCode 142

**难度**：中等 ｜ **分类**：链表 ｜ **标签**：快慢指针 + 数学

## 题目描述

给定一个链表的头节点 head,返回链表开始入环的第一个节点。如果链表无环,则返回 null。
不允许修改链表。

**示例**
```
输入: head = [3,2,0,-4], pos = 1 (尾部 -4 指向下标 1 的节点 2)
输出: 返回下标为 1 的节点 2(环的入口)
```

<!-- @题解 -->

## 思路与图解

**第一步:快慢指针判环。** 慢指针每次走 1 步,快指针每次走 2 步。若有环,二者必然相遇(快指针绕圈追上)。

**第二步:找入口——数学关系。** 设头到环口距离为 `a`,环口到相遇点距离为 `b`,相遇点绕回环口距离为 `c`(环长 = b+c)。

```
        a           b
  ●───●───●───●───●(相遇点)
        |           |
        ●───────────●
             c        (绕一圈回环口)
```

慢指针路程:`a + b`
快指针路程:`a + b + n·(b+c)`(n 为多绕的圈数)
快 = 2 × 慢 ⇒ `a + b + n(b+c) = 2(a+b)` ⇒ `a = n(b+c) - b = (n-1)(b+c) + c`

当 n=1 时:`a = c`,即**头走到环口的距离 = 相遇点继续走到环口的距离**。
所以相遇后,让一个指针从头出发、一个从相遇点出发,都每次走一步,**再次相遇处就是环口**。

```
指针1: ●→→→(a步)      → 环口 ✓
指针2: (相遇点)→→→(c步) → 环口 ✓   (二者必在环口相遇)
```

## 复杂度

- 时间:O(n)
- 空间:O(1)

## 参考代码

### C++

```cpp
class Solution {
public:
    ListNode *detectCycle(ListNode *head) {
        ListNode *slow = head, *fast = head;
        while (fast && fast->next) {
            slow = slow->next;        // 1 步
            fast = fast->next->next;  // 2 步
            if (slow == fast) {       // 有环,找入口
                ListNode* p = head;   // 头出发
                while (p != slow) { p = p->next; slow = slow->next; }
                return p;
            }
        }
        return nullptr;               // 无环
    }
};
```

### Python

```python
class Solution:
    def detectCycle(self, head: Optional[ListNode]) -> Optional[ListNode]:
        slow = fast = head
        while fast and fast.next:
            slow = slow.next
            fast = fast.next.next
            if slow == fast:              # 相遇说明有环
                p = head
                while p != slow:          # 同步走到环口
                    p = p.next
                    slow = slow.next
                return p
        return None
```

## 小结

- 快慢指针不仅能判环,还能借助"路程差"的数学关系定位入口。
- 联想:141(判环)、287(数组找重复数 = 把下标当链表)、202(快乐数) 都是同一套路。
