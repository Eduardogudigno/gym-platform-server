import { BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { User } from './user.model';

@Table({ tableName: 'refresh_tokens', underscored: true })
export class RefreshToken extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare userId: string;

  @Column(DataType.CHAR(64))
  declare tokenHash: string;

  @Column(DataType.DATE(3))
  declare expiresAt: Date;

  @Column(DataType.DATE(3))
  declare revokedAt: Date | null;

  @Column(DataType.UUID)
  declare replacedById: string | null;

  @Column(DataType.STRING(255))
  declare userAgent: string | null;

  @Column(DataType.STRING(45))
  declare ipAddress: string | null;

  @BelongsTo(() => User)
  declare user?: User;

  declare createdAt: Date;
  declare updatedAt: Date;
}
