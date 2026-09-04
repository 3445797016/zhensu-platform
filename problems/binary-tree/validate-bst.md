# 验证二叉搜索树 LeetCode 98

**难度**：中等 ｜ **分类**：二叉树 ｜ **标签**：BST / 中序遍历

## 题目描述

给你一个二叉树的根节点 root,判断其是否是一个有效的二叉搜索树。
有效 BST 定义如下:节点的左子树只包含**小于**当前节点的数;节点的右子树只包含**大于**当前节点的数;所有左子树和右子树自身必须也是二叉搜索树。

**示例**
```
输入:
     5
   /   \
  4     6       输出: false
       / \
      3   7
```

<!-- @题解 -->

## 思路与图解

**关键结论:BST 的中序遍历结果是严格递增序列。** 只需中序遍历,检查当前节点是否大于前一个节点。

```
     5
   /   \
  4     6
       / \
      3   7

中序序列: 4, 5, 3, 6, 7   ← 3 是 5 右子树里的节点却小于 5,序列非递增 → false
```

为什么不能只判断"每个节点大于左孩子、小于右孩子"?
```
     5
   /   \
  4     6
       / \
      3   7
```
每个节点与直接孩子都满足(5>4、6>5、6>3、7>6 全部成立),但 3 出现在 5 的右子树里却小于 5 → 全局约束被破坏。
用中序遍历+前驱比较,天然检查整棵子树的全局范围。

## 复杂度

- 时间:O(n)
- 空间:O(h),递归栈深(迭代中序为 O(h) 辅助栈)

## 参考代码

### C++

```cpp
class Solution {
public:
    long long pre = LLONG_MIN;      // 中序前驱,初始为负无穷
    bool isValidBST(TreeNode* root) {
        if (!root) return true;
        if (!isValidBST(root->left)) return false;
        if (root->val <= pre) return false;   // 必须严格大于前驱
        pre = root->val;
        return isValidBST(root->right);
    }
};
```

### Python

```python
class Solution:
    def isValidBST(self, root: Optional[TreeNode]) -> bool:
        pre = -float('inf')
        def dfs(node):
            nonlocal pre
            if not node:
                return True
            if not dfs(node.left):
                return False
            if node.val <= pre:      # 必须严格大于前驱
                return False
            pre = node.val
            return dfs(node.right)
        return dfs(root)
```

## 小结

- **BST 中序遍历递增**是最常用判定方法,也用于 230(第 k 小)等题。
- 另一种写法:递归传 `(min, max)` 区间约束;注意用 `long long`/`inf` 处理边界(如节点值恰为 INT_MIN)。
