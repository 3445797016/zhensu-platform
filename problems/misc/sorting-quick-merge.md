# 排序专题:快速排序 + 归并排序

**难度**：中等 ｜ **分类**：排序 ｜ **标签**：分治 / 排序

## 题目描述

手写两个最常用的 O(n log n) 排序:快速排序(原地、不稳定)与归并排序(稳定、需额外空间)。
典型题:912 排序数组、215 数组中的第 K 个最大元素(快排的 partition 思想)。

## 参考示例
```
输入: [5,2,3,1]
输出: [1,2,3,5]
```

<!-- @题解 -->

## 思路与图解

**快速排序**:选一个基准 pivot,把数组分成"小于 pivot | pivot | 大于 pivot"三段,再递归两边。
```
初始:  [5 2 3 1],取最后一个1为pivot
partition 后:  [1][5 2 3]        1 归位
递归左边已单元素;右边 [5 2 3] 取 pivot=3
  → [2][3][5] → [2 3 5]
合并 → [1 2 3 5] ✓

图解分治:
     [5 2 3 1]
     ↓ partition
  [1] [5 2 3]
      ↓ partition
   [2] [3][5]
```

**归并排序**:先递归对半切到单元素,再"合并两个有序数组"。
```
[5 2 3 1]
  ↓ 切分
[5 2] [3 1]
 ↓    ↓
[5][2] [3][1]      ← 递归到底
 ↓合并 ↓合并
[2 5] [1 3]
  ↓ 合并两个有序数组
[1 2 3 5] ✓

合并 [2 5] 与 [1 3]:
  比较头部:1<2 取1 → 2<3 取2 → 3<5 取3 → 取5 → [1,2,3,5]
```

- 快排:平均 O(n log n)、最坏 O(n²),原地;工程上常用"三数取中 + 小区间插入排序"优化。
- 归并:稳定 O(n log n),需要 O(n) 辅助数组;适合链表排序(148)。

## 复杂度

- 快排:平均 O(n log n),最坏 O(n²);空间 O(log n) 栈
- 归并:O(n log n) 稳定;空间 O(n)

## 参考代码

### C++

```cpp
int partition(vector<int>& a, int lo, int hi) {
    int p = a[hi], i = lo;                 // 选末尾为基准
    for (int j = lo; j < hi; j++)
        if (a[j] < p) swap(a[i++], a[j]);
    swap(a[i], a[hi]);
    return i;
}
void quickSort(vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;
    int m = partition(a, lo, hi);
    quickSort(a, lo, m - 1);
    quickSort(a, m + 1, hi);
}

void mergeSort(vector<int>& a, int lo, int hi, vector<int>& tmp) {
    if (lo >= hi) return;
    int mid = lo + (hi - lo) / 2;
    mergeSort(a, lo, mid, tmp);
    mergeSort(a, mid + 1, hi, tmp);
    int i = lo, j = mid + 1, k = lo;
    while (i <= mid && j <= hi) tmp[k++] = a[i] <= a[j] ? a[i++] : a[j++];
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= hi)  tmp[k++] = a[j++];
    for (int t = lo; t <= hi; t++) a[t] = tmp[t];
}
```

### Python

```python
def quick_sort(a):
    if len(a) <= 1:
        return a
    pivot = a[-1]
    lo = [x for x in a[:-1] if x <= pivot]
    hi = [x for x in a[:-1] if x > pivot]
    return quick_sort(lo) + [pivot] + quick_sort(hi)

def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    L, R = merge_sort(a[:mid]), merge_sort(a[mid:])
    i = j = 0
    out = []
    while i < len(L) and j < len(R):
        if L[i] <= R[j]:
            out.append(L[i]); i += 1
        else:
            out.append(R[j]); j += 1
    return out + L[i:] + R[j:]
```

## 小结

- 快排关键在 partition(它也是 215 第 K 大、荷兰国旗问题的核心)。
- 归并关键在"合并两个有序数组"(也是 88、148 链表排序的核心)。
- 需要稳定排序或 O(1) 无法满足时选归并;追求原地与缓存友好选快排。
