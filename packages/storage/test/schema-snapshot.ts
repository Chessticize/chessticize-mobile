import type { SyncSqliteDatabase } from "../src/sync-sqlite-store.ts";

export interface SchemaColumnSnapshot {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | number | null;
  primaryKeyIndex: number;
}

export interface SchemaIndexSnapshot {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface SchemaForeignKeySnapshot {
  table: string;
  from: string;
  to: string;
  onUpdate: string;
  onDelete: string;
}

export interface SchemaTableSnapshot {
  name: string;
  columns: SchemaColumnSnapshot[];
  indexes: SchemaIndexSnapshot[];
  foreignKeys: SchemaForeignKeySnapshot[];
}

export type SchemaSnapshot = SchemaTableSnapshot[];

// Columns are sorted by name so an ALTER-TABLE-appended column compares equal to one declared inline; raw DDL text is deliberately excluded since two schemas can be logically identical but textually different.
export function computeSchemaSnapshot(db: SyncSqliteDatabase): SchemaSnapshot {
  const tableNames = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);

  return tableNames.map((name) => ({
    name,
    columns: tableColumns(db, name),
    indexes: tableIndexes(db, name),
    foreignKeys: tableForeignKeys(db, name)
  }));
}

function tableColumns(db: SyncSqliteDatabase, table: string): SchemaColumnSnapshot[] {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | number | null;
    pk: number;
  }>;
  return columns
    .map((column) => ({
      name: column.name,
      type: column.type,
      notNull: column.notnull !== 0,
      defaultValue: column.dflt_value,
      primaryKeyIndex: column.pk
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function tableIndexes(db: SyncSqliteDatabase, table: string): SchemaIndexSnapshot[] {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as Array<{
    name: string;
    unique: number;
    origin: string;
  }>;
  return indexes
    .filter((index) => index.origin !== "pk")
    .map((index) => {
      const columns = db.prepare(`PRAGMA index_info(${index.name})`).all() as Array<{ name: string | null }>;
      return {
        name: index.name,
        unique: index.unique !== 0,
        columns: columns.map((column) => column.name ?? "")
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function tableForeignKeys(db: SyncSqliteDatabase, table: string): SchemaForeignKeySnapshot[] {
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{
    table: string;
    from: string;
    to: string;
    on_update: string;
    on_delete: string;
  }>;
  return foreignKeys
    .map((foreignKey) => ({
      table: foreignKey.table,
      from: foreignKey.from,
      to: foreignKey.to,
      onUpdate: foreignKey.on_update,
      onDelete: foreignKey.on_delete
    }))
    .sort((left, right) => `${left.from}->${left.table}.${left.to}`.localeCompare(`${right.from}->${right.table}.${right.to}`));
}
