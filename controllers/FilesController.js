import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import path from 'path';
import {
  mkdir,
  writeFile,
} from 'node:fs/promises';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const FILE_TYPE = new Set(['folder', 'file', 'image']);
const DEFAULT_PATH = '/tmp/files_manager';

export const postUpload = async (req, res) => {
  const token = req.header('X-Token');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usersCollection = dbClient.db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filePayload = req.body;

    if (!filePayload.name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!filePayload.type || !FILE_TYPE.has(filePayload.type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (!filePayload.data && filePayload.type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    const filesCollection = dbClient.db.collection('files');

    let parentFolder = null;
    if (filePayload.parentId && filePayload.parentId !== '0') {
      if (!ObjectId.isValid(filePayload.parentId)) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      parentFolder = await filesCollection.findOne({ _id: new ObjectId(filePayload.parentId) });

      if (!parentFolder) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFolder.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const basePath = process.env.FOLDER_PATH || DEFAULT_PATH;
    const parentIdValue = parentFolder ? parentFolder._id : '0';

    if (filePayload.type === 'folder') {
      const folderDoc = {
        userId: user._id,
        name: filePayload.name,
        type: 'folder',
        isPublic: filePayload.isPublic || false,
        parentId: parentIdValue,
      };

      const { insertedId } = await filesCollection.insertOne(folderDoc);

      const responseParentId = folderDoc.parentId === '0' ? 0 : folderDoc.parentId.toString();

      return res.status(201).json({
        id: insertedId.toString(),
        userId: folderDoc.userId.toString(),
        name: folderDoc.name,
        type: folderDoc.type,
        isPublic: folderDoc.isPublic,
        parentId: responseParentId,
      });
    }

    await mkdir(basePath, { recursive: true });

    const fileName = uuidv4();
    const localPath = path.join(basePath, fileName);
    await writeFile(localPath, Buffer.from(filePayload.data, 'base64'));

    const fileDoc = {
      userId: user._id,
      name: filePayload.name,
      type: filePayload.type,
      isPublic: filePayload.isPublic || false,
      parentId: parentIdValue,
      localPath,
    };

    const { insertedId } = await filesCollection.insertOne(fileDoc);

    const responseParentId = fileDoc.parentId === '0' ? 0 : fileDoc.parentId.toString();

    return res.status(201).json({
      id: insertedId.toString(),
      userId: fileDoc.userId.toString(),
      name: fileDoc.name,
      type: fileDoc.type,
      isPublic: fileDoc.isPublic,
      parentId: responseParentId,
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
