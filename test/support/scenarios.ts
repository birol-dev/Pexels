import type { FakeNetwork } from './fake-network.ts'
import { video, videoFileUrl } from './pexels-fixtures.ts'
import { searchVideos, select, submitBeats } from './run-job.ts'

export const ONE_BEAT_SCRIPT = 'One sentence.'

/**
 * Scripts the shortest job that completes: one beat, one video search, one selection.
 * Selecting starts the download, so the model asks for nothing more. Three LLM requests,
 * one Pexels request, one media request.
 */
export function scriptOneBeatJob(network: FakeNetwork): void {
  const clip = video(101, 'city-street')
  network.pexels.videos('city street', [clip])
  network.llm
    .tools([submitBeats([ONE_BEAT_SCRIPT])])
    .tools([searchVideos('beat_1', 'city street')])
    .tools([
      select([
        {
          beatId: 'beat_1',
          assetType: 'video',
          pexelsId: 101,
          variantUrl: videoFileUrl(clip, 'hd')
        }
      ])
    ])
}
