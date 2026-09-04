# 翻转二叉树 LeetCode 226

**难度**：简单 ｜ **分类**：二叉树 ｜ **标签**：递归 / BFS

## 题目描述

给你一棵二叉树的根节点 root,翻转这棵二叉树,并返回其根节点。(把每个节点的左右子树交换)

**示例**
```
输入:
     4
   /   \
  2     7
 / \   / \
1   3 6   9
输出:
     4
   /   \
  7     2
 / \   / \
9   6 3   1
```

<!-- @题解 -->

## 思路与图解

对每个节点:**交换它的左右孩子,再递归翻转左右子树**。任何遍历顺序都行,这里用前序(自顶向下):

```
     4                    4                    4
   /   \   交换2的孩子   /   \   交换7的孩子   /   \
  2     7   →           2     7   →           7     2
 / \   / \             / \   / \             / \   / \
1   3 6   9           3   1 9   6           9   6 3   1

逐层看:
原始:   2          7           翻转后:   7          2
       / \        / \                   / \        / \
      1   3      6   9                 9   6      3   1
```

递归基:空节点直接返回。整棵树所有左右子树都交换,得到镜像树。

## 复杂度

- 时间:O(n),每个节点访问一次
- 空间:O(h),递归栈深(h 为树高,最坏 n)

## 参考代码

### C++

```cpp
class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (!root) return nullptr;
        swap(root->left, root->right);      // 先交换
        invertTree(root->left);             // 再递归翻转子树
        invertTree(root->right);
        return root;
    }
};
```

### Python

```python
class Solution:
    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
        if not root:
            return None
        root.left, root.right = root.right, root.left
        self.invertTree(root.left)
        self.invertTree(root.right)
        return root
```

## 小结

- 二叉树的递归题套路:**先写递归基,再决定"处理当前节点"与"递归左右子树"的顺序**。
- 本题也可层序 BFS,每层出队时交换节点的左右孩子。
