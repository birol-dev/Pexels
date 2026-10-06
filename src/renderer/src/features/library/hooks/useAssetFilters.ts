import { useState } from 'react'
import type { StatusFilter, TypeFilter } from '../types'

export interface AssetFilters {
  searchQuery: string
  setSearchQuery: (value: string) => void
  typeFilter: TypeFilter
  setTypeFilter: (value: TypeFilter) => void
  statusFilter: StatusFilter
  setStatusFilter: (value: StatusFilter) => void
}

export function useAssetFilters(): AssetFilters {
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  return { searchQuery, setSearchQuery, typeFilter, setTypeFilter, statusFilter, setStatusFilter }
}
