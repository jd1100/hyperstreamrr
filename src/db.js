// src/db.js
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import crypto from 'hypercore-crypto';

export function openView(store) {
  return new Hyperbee(store.get({ name: 'hyperbee-view' }), {
    keyEncoding: 'utf-8',
    valueEncoding: 'json'
  });
}

export async function applyChanges(batch, db, base) {
  for (const node of batch) {
    const { value } = node;
    if (!value) continue;

    try {
      switch (value.type) {
        case 'PUBLISH_DRIVE':
          await db.put(`/drives/${value.driveKey}`, {
            key: value.driveKey,
            topic: value.topic,
            owner: {
              id: node.from ? b4a.toString(node.from.key, 'hex') : value.metadata.ownerId,
              name: value.metadata.ownerName || 'Unknown'
            },
            name: value.metadata.name,
            description: value.metadata.description || '',
            categories: value.metadata.categories || [],
            tags: value.metadata.tags || [],
            stats: value.metadata.stats,
            files: value.files,
            publishedAt: value.timestamp,
            verified: false
          });

          for (const file of value.files) {
            const searchKey = file.name.toLowerCase();
            const fileHash = crypto.randomBytes(16).toString('hex');
            await db.put(`/search/files/${searchKey}/${fileHash}`, {
              ref: `/files/${value.driveKey}/${file.path}`
            });
            await db.put(`/files/${value.driveKey}/${file.path}`, {
              ...file,
              driveKey: value.driveKey
            });
          }
          break;

        case 'UNPUBLISH_DRIVE':
          const drive = await db.get(`/drives/${value.driveKey}`);
          if (drive) {
            for (const file of drive.value.files) {
              const searchKey = file.name.toLowerCase();
              const prefix = `/search/files/${searchKey}/`;
              for await (const { key } of db.createReadStream({ gt: prefix, lt: prefix + '~' })) {
                await db.del(key);
              }
              await db.del(`/files/${value.driveKey}/${file.path}`);
            }
            await db.del(`/drives/${value.driveKey}`);
          }
          break;

        case 'ADD_ADMIN':
          await db.put(`/admins/${value.writerKey}`, {
            key: value.writerKey,
            name: value.name,
            addedAt: value.timestamp,
            founder: value.founder || false,
            adminPublicKey: value.adminPublicKey
          });
          await db.put(`/admin-registry/${value.writerKey}`, {
            key: value.writerKey,
            name: value.name,
            addedAt: value.timestamp,
            founder: value.founder || false,
            adminPublicKey: value.adminPublicKey
          });

          if (!value.founder && base.addWriter) {
            try {
              await base.addWriter(b4a.from(value.writerKey, 'hex'), {
                indexer: true
              });
            } catch (error) {
              console.error('Failed to add writer:', error);
            }
          }
          break;

        case 'VERIFY_DRIVE':
          const driveNode = await db.get(`/drives/${value.driveKey}`);
          if (driveNode?.value) {
            await db.put(`/drives/${value.driveKey}`, {
              ...driveNode.value,
              verified: true,
              verifiedBy: node.from ? b4a.toString(node.from.key, 'hex') : 'system',
              verifiedAt: value.timestamp
            });
          }
          break;
      }
    } catch (error) {
      console.error('Apply error:', error);
    }
  }
}
