import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const renderPageNumbers = () => {
    const pages = [];
    const showEllipsis = totalPages > 5;

    let startPage = 1;
    let endPage = totalPages;

    if (showEllipsis) {
      if (currentPage <= 3) {
        startPage = 1;
        endPage = 4;
      } else if (currentPage >= totalPages - 2) {
        startPage = totalPages - 3;
        endPage = totalPages;
      } else {
        startPage = currentPage - 1;
        endPage = currentPage + 1;
      }
    }

    // Add first page and ellipsis if needed
    if (showEllipsis && startPage > 1) {
      pages.push(
        <PageButton key={1} page={1} isActive={currentPage === 1} onPress={() => onPageChange(1)} />
      );
      if (startPage > 2) {
        pages.push(
          <View key="ellipsis-start" className="w-8 items-center justify-center">
            <Text className="text-[#6b6880] font-bold tracking-widest text-lg">...</Text>
          </View>
        );
      }
    }

    // Add middle pages
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <PageButton key={i} page={i} isActive={currentPage === i} onPress={() => onPageChange(i)} />
      );
    }

    // Add last page and ellipsis if needed
    if (showEllipsis && endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(
          <View key="ellipsis-end" className="w-8 items-center justify-center">
            <Text className="text-[#6b6880] font-bold tracking-widest text-lg">...</Text>
          </View>
        );
      }
      pages.push(
        <PageButton key={totalPages} page={totalPages} isActive={currentPage === totalPages} onPress={() => onPageChange(totalPages)} />
      );
    }

    return pages;
  };

  return (
    <View className="flex-row items-center justify-center gap-x-2 py-4">
      <Pressable
        onPress={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="w-10 h-10 rounded-xl bg-[#1a1b24] border border-[#2b2d3a] items-center justify-center"
        style={{ opacity: currentPage === 1 ? 0.3 : 1 }}
      >
        <Ionicons name="chevron-back" size={16} color="#fff" />
      </Pressable>

      <View className="flex-row items-center gap-x-1">
        {renderPageNumbers()}
      </View>

      <Pressable
        onPress={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="w-10 h-10 rounded-xl bg-[#1a1b24] border border-[#2b2d3a] items-center justify-center"
        style={{ opacity: currentPage === totalPages ? 0.3 : 1 }}
      >
        <Ionicons name="chevron-forward" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

function PageButton({ page, isActive, onPress }: { page: number; isActive: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`w-10 h-10 rounded-xl items-center justify-center border ${
        isActive ? 'bg-[#00E68A] border-[#00E68A]' : 'bg-transparent border-transparent'
      }`}
    >
      <Text className={`font-bold text-sm ${isActive ? 'text-[#13141a]' : 'text-[#8B92A5]'}`}>
        {page}
      </Text>
    </Pressable>
  );
}
