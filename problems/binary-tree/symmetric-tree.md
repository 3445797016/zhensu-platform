# 对称二叉树 LeetCode 101

**难度**：简单 ｜ **分类**：二叉树 ｜ **标签**：递归

## 题目描述

给你一个二叉树的根节点 root,检查它是否轴对称。

**示例**
```
输入:      1         输出: true
        /   \
       2     2
      / \   / \
     3   4 4   3
```

<!-- @题解 -->

## 思路与图解

注意:**不是比较左右子树是否相同,而是左右子树互为镜像**。
判断两棵树 `p`、`q` 是否对称(镜像):
- 都为空 → 对称;
- 一个空一个非空 → 不对称;
- 值不相等 → 不对称;
- 递归:`p.left` 对 `q.right`,`p.right` 对 `q.left`(镜像比较是"外对外、内对内")。

```
       1
     /   \
   (2)    (2)        比较左2 vs 右2
   / \     / \
  3   4   4   3
  ↑       ↑         外:3 vs 3 ✓
     ↑↑↑↑           内:4 vs 4 ✓(左2的右孩子4 与 右2的左孩子4)

递归树:
  isMirror(2左,2右)
  ├─ isMirror(3,3)     ✓(都空或值同)
  └─ isMirror(4,4)     ✓
```

## 复杂度

- 时间:O(n)
- 空间:O(h),递归栈深

## 参考代码

### C++

```cpp
class Solution {
public:
    bool isMirror(TreeNode* p, TreeNode* q) {
        if (!p && !q) return true;
        if (!p || !q || p->val != q->val) return false;
        return isMirror(p->left, q->right) && isMirror(p->right, q->left);
    }
    bool isSymmetric(TreeNode* root) {
        return isMirror(root->left, root->right);
    }
};
```

### Python

```python
class Solution:
    def isSymmetric(self, root: Optional[TreeNode]) -> bool:
        def mirror(p, q):
            if not p and not q:
                return True
            if not p or not q or p.val != q.val:
                return False
            return mirror(p.left, q.right) and mirror(p.right, q.left)
        return mirror(root.left, root.right)
```

## 小结

- 区分两个概念:**相同**(p.left 对 q.left)与**镜像**(p.left 对 q.right)。
- 迭代版:用队列每次取两个节点成对比较,入队顺序 `p.left,q.right,p.right,q.left`。
