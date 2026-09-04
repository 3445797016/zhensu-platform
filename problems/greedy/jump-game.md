# 跳跃游戏 LeetCode 55

**难度**：中等 ｜ **分类**：贪心 ｜ **标签**：覆盖区间

## 题目描述

给你一个非负整数数组 nums,你最初位于数组的第一个下标。数组中的每个元素代表你在该位置可以跳跃的最大长度。
判断你是否能够到达最后一个下标。

**示例**
```
输入: nums = [2,3,1,1,4]
输出: true        (先跳1步到3,再跳3步到末尾)
输入: nums = [3,2,1,0,4]
输出: false       (无论如何都会停在 0 位置)
```

<!-- @题解 -->

## 思路与图解

不模拟"具体跳几步",而是维护**当前能覆盖到的最远下标 cover**,每到一个位置就"尽力扩张覆盖"。
只要 cover 能到达最后下标就成功。

```
nums = [2, 3, 1, 1, 4]

i=0  cover = 0+2 = 2   (最远到下标2)
i=1  1≤2 可达 → cover = max(2, 1+3) = 4   ← 已经覆盖到最后一个下标4 ✓
中途:只要 i 没有超过 cover 就说明仍可达,继续扩张

nums = [3, 2, 1, 0, 4]
i=0  cover = 3
i=1  cover = max(3,1+2)=3
i=2  cover = max(3,2+1)=3
i=3  cover = max(3,3+0)=3
i=4  4 > cover(3) → 到不了下标4 → false

图解覆盖区间:
  [2 3 1 1 4]
  覆盖: 0──2
          0──────4   (下标1处跳3步)
  区间连续覆盖,只要最终 cover≥n-1 即成功
```

核心:**只关心"最远覆盖",不关心具体路线** —— 这就是贪心:每个可达点都尽可能扩大 cover。

## 复杂度

- 时间:O(n)
- 空间:O(1)

## 参考代码

### C++

```cpp
class Solution {
public:
    bool canJump(vector<int>& nums) {
        int cover = 0;
        for (int i = 0; i <= cover && i < nums.size(); i++) {
            cover = max(cover, i + nums[i]);
            if (cover >= nums.size() - 1) return true;
        }
        return cover >= nums.size() - 1;
    }
};
```

### Python

```python
class Solution:
    def canJump(self, nums: List[int]) -> bool:
        cover = 0
        for i in range(len(nums)):
            if i > cover:
                return False            # 当前位置已不可达
            cover = max(cover, i + nums[i])
        return True
```

## 小结

- **覆盖区间/最远可达**是跳跃类贪心的标准模型。
- 45 跳跃游戏 II 求最少步数:同样贪心,但需记录"当前覆盖"与"下一步覆盖"两个边界来分段计数。
